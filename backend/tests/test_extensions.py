"""
Unit tests for SatQuery Extensions: F0, F1, F2, F5.
"""
import pytest
import numpy as np

from core import features
from core.geo.admin_lookup import get_admin_lookup
from services.ingest.enhance import enhance, quality_gate, radiometric
from services.annotation.geometry import norm_to_pixel, norm_to_geo, shapes_to_mask, describe_layer_for_prompt
from features.historical.analytics import compute_analytics_overview


def test_feature_flags():
    assert features.enabled("enhancement") is True
    assert features.enabled("annotation") is True
    assert features.enabled("historical") is True
    assert features.enabled("geo3d") is False

    cap = features.capability_map()
    assert cap["enhancement"] is True
    assert cap["annotation"] is True
    assert cap["historical"] is True
    assert cap["stack"] is False


def test_admin_lookup():
    lookup = get_admin_lookup()
    assert lookup.count > 700

    # Pune centroid ~ (73.8567, 18.5204)
    unit = lookup.label_for(73.8567, 18.5204)
    assert unit is not None
    assert "pune" in unit.district.lower()

    # Search
    results = lookup.search("Mumbai")
    assert len(results) > 0
    assert any("mumbai" in r.district.lower() for r in results)


def test_enhancement_radiometric():
    arr = np.random.rand(100, 100, 3).astype(np.float32)
    meta = {"gsd_m": 10.0, "width": 100, "height": 100}
    enhanced, record = enhance(meta, arr, modality="optical", method="radiometric")
    assert enhanced.shape == arr.shape
    assert record["accepted"] is True
    assert record["method"] == "radiometric"


def test_enhancement_quality_gate():
    arr = np.random.rand(50, 50).astype(np.float32)
    # identical image -> should pass with high SSIM
    q = quality_gate(arr, arr)
    assert q["ssim_vs_upsampled"] >= 0.7


def test_annotation_geometry():
    # norm_to_pixel
    px, py = norm_to_pixel([0.5, 0.5], 1000, 1000)
    assert px == 500 and py == 500

    # norm_to_geo
    bounds = [70.0, 15.0, 80.0, 25.0]
    lon, lat = norm_to_geo([0.5, 0.5], bounds)
    assert lon == 75.0 and lat == 20.0

    # shapes_to_mask
    shapes = [
        {
            "kind": "rectangle",
            "points": [[0.2, 0.2], [0.8, 0.8]],
        }
    ]
    mask = shapes_to_mask(shapes, 100, 100)
    assert mask.shape == (100, 100)
    assert mask.sum() > 0

    # describe_layer
    layer = {
        "name": "Test ROI",
        "colour": "#ef4444",
        "shapes": [
            {"kind": "polygon", "points": [[0.1, 0.1], [0.3, 0.1], [0.3, 0.3], [0.1, 0.3]], "label": "Lake"}
        ]
    }
    desc = describe_layer_for_prompt(layer, bounds, 10.0)
    assert "north-west" in desc or "Region [1]" in desc


def test_historical_analytics_overview():
    overview = compute_analytics_overview()
    assert overview.kpis.total_scenes >= 0
    assert len(overview.scenes_over_time) > 0
    assert len(overview.task_mix) > 0
    assert len(overview.tool_usage) > 0
    assert len(overview.modality_mix) > 0
    assert len(overview.districts) > 0


@pytest.mark.asyncio
async def test_location_history_service():
    from features.location_history.service import research_location_history

    report = await research_location_history(
        location="Pune",
        date_range="2000-2026",
        topic="infrastructure, flooding",
    )

    assert report is not None
    assert "pune" in report.overview.district.lower()
    assert len(report.timeline) >= 4
    assert len(report.sources) >= 3
    assert len(report.major_events) >= 3
    assert report.context_analysis.summary != ""
    assert report.development_summary.urban_expansion != ""

    # Check non-causal caveat is present
    assert "causal" in report.context_analysis.methodological_caveat.lower()
