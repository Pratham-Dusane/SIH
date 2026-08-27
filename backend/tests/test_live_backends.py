"""
Live backend smoke tests — opt-in, they make real network calls.

The rest of the suite is hermetic (see conftest.no_network_by_default) so it can
run in the `--network none` offline evaluation container (PRD §11.5). These
tests are the opposite: they exist to prove the real credentials in `.env`
actually work, and they are skipped unless you ask for them:

    pytest tests/test_live_backends.py --live

Each test skips itself with a readable reason when its backend is not
configured, so a partial setup still gives a useful report.
"""

import asyncio
import io

import numpy as np
import pytest
from PIL import Image

# These tests need the REAL settings, not the hermetic stubs.
pytestmark = pytest.mark.live


def _tile(kind: str = "single") -> bytes:
    a = np.zeros((320, 320, 3), dtype=np.uint8)
    a[:100] = (28, 62, 138)          # water
    if kind == "t2":
        a[100:210] = (46, 118, 52)   # vegetation
        a[210:] = (168, 166, 160)    # new built-up
    else:
        a[100:] = (46, 118, 52)      # vegetation
    buf = io.BytesIO()
    Image.fromarray(a).save(buf, format="PNG")
    return buf.getvalue()


def _run(coro):
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# VLM gateway
# ---------------------------------------------------------------------------
@pytest.fixture
def live_vlm(real_settings):
    from services.inference.vlm_gateway import vlm_available
    ok, reason = vlm_available()
    if not ok:
        pytest.skip(f"VLM not configured: {reason}")
    return real_settings


def test_live_vlm_answers_a_question(live_vlm):
    from services.inference.vlm_gateway import TEMPLATES, vlm_call

    out = _run(vlm_call([_tile()],
                        TEMPLATES["vqa"].format(question="What is at the top of this image?"),
                        backend=live_vlm.VLM_BACKEND))

    assert out["text"].strip(), (
        "The VLM returned no text. If truncated=True, raise VLM_MAX_TOKENS: "
        f"{out.get('truncated')=} {out.get('thinking_tokens')=}"
    )
    assert out["blocked"] is False
    assert out["model"] == live_vlm.GEMINI_MODEL or out["backend"] != "gemini"


def test_live_vlm_returns_a_parseable_normalised_box(live_vlm):
    """
    Guards the §8.3.3 contract against a model that answers on a 0-1000 scale.
    If this fails, rs_ground will only ever produce honest negatives — check
    GEMINI_MODEL before assuming the tool is broken.
    """
    from services.inference.vlm_gateway import TEMPLATES, parse_bbox, vlm_call

    out = _run(vlm_call([_tile()],
                        TEMPLATES["ground"].format(phrase="the blue water body"),
                        backend=live_vlm.VLM_BACKEND))
    box = parse_bbox(out["text"])

    assert box is not None, (
        f"{live_vlm.GEMINI_MODEL} did not return a normalised [0,1] box. "
        f"Raw response: {out['text']!r}"
    )
    assert all(0.0 <= v <= 1.0 for v in box)
    # Water occupies the top ~31% of the tile.
    assert box[1] < 0.2, f"box does not start near the top: {box}"
    assert box[3] < 0.6, f"box extends well past the water band: {box}"


def test_live_rs_vqa_tool_end_to_end(live_vlm, live_ctx):
    from tools.rs_vqa import RSVQAParams, RSVQATool

    res = _run(RSVQATool().run(live_ctx("SINGLE"),
                               RSVQAParams(question="Describe the land cover.")))

    assert res.model_id == "V1"
    assert res.model_version.startswith(live_vlm.VLM_BACKEND + ":")
    assert res.confidence > 0.0
    assert "not self-consistency" in res.confidence_basis
    assert "status" not in res.facts, f"tool did not actually run: {res.facts}"


def test_live_rs_ground_tool_produces_geojson(live_vlm, live_ctx):
    from tools.rs_ground import RSGroundParams, RSGroundTool

    res = _run(RSGroundTool().run(live_ctx("SINGLE"),
                                  RSGroundParams(phrase="the blue water body")))

    assert res.facts.get("boxes"), f"no box parsed; facts={res.facts}"
    assert res.artifacts.get("geojson"), "georeferenced scene should yield a GeoJSON polygon"
    ring = res.artifacts["geojson"]["features"][0]["geometry"]["coordinates"][0]
    assert ring[0] == ring[-1], "GeoJSON ring must be closed"


def test_live_rs_ground_returns_an_honest_negative(live_vlm, live_ctx):
    from tools.rs_ground import RSGroundParams, RSGroundTool

    res = _run(RSGroundTool().run(
        live_ctx("SINGLE"), RSGroundParams(phrase="a commercial airport terminal building")))

    if res.facts.get("boxes"):
        pytest.skip("model located something for the absent phrase; not a contract failure")
    assert res.confidence == 0.0
    assert res.text.startswith("No region matching")


# ---------------------------------------------------------------------------
# Earth Engine
# ---------------------------------------------------------------------------
@pytest.fixture
def live_gee(real_settings):
    from core.gee import gee_available, init_gee
    init_gee(force=True)
    ok, reason = gee_available()
    if not ok:
        pytest.skip(f"Earth Engine not configured: {reason}")
    return real_settings


# A real AOI with guaranteed Sentinel-2 coverage: ~10 km over Bengaluru.
AOI = [77.55, 12.90, 77.65, 13.00]


def test_live_gee_land_cover(live_gee):
    from core.gee import land_cover

    out = land_cover(AOI, "2023-01-01", "2023-03-31", scale=10)

    assert out["class_fractions"], f"no land cover returned: {out}"
    total = sum(out["class_fractions"].values())
    assert 0.98 <= total <= 1.02, f"fractions must sum to 1, got {total}"
    assert out["product"] in ("GOOGLE/DYNAMICWORLD/V1",
                              "ESA/WorldCover/v200", "ESA/WorldCover/v100")


def test_live_gee_change_detection(live_gee, tmp_path):
    from core.gee import change_ndvi_ndbi

    out = change_ndvi_ndbi(AOI, "2020-01-15", "2023-01-15",
                           threshold=0.3, scale=30, window_days=45,
                           export_path=str(tmp_path / "change_mask.tif"))

    assert out["changed_fraction"] is not None, f"no statistics returned: {out}"
    assert 0.0 <= out["changed_fraction"] <= 1.0
    assert out["changed_area_ha"] is not None
    assert out["direction"] in ("built_up_increase", "vegetation_increase",
                               "vegetation_decrease", "unchanged", "unknown")
    assert out["mask_path"], "change mask GeoTIFF export failed"


def test_live_gee_sentinel1(live_gee):
    from core.gee import sentinel1_grd

    out = sentinel1_grd(AOI, "2023-01-01", "2023-03-31", polarisation="VV", scale=30)
    if not out["available"]:
        pytest.skip(f"no Sentinel-1 coverage: {out['reason']}")
    assert out["image_count"] > 0
    assert out["backscatter_db"]


def test_live_rs_classify_tool(live_gee, live_ctx):
    from tools.rs_classify import LandCoverTool, RSClassifyParams

    res = _run(LandCoverTool().run(live_ctx("SINGLE"), RSClassifyParams()))

    assert res.model_id == "G1"
    assert res.confidence == 0.7
    assert res.facts.get("class_fractions"), f"{res.text} | {res.facts}"
    assert "not a measurement of the exact uploaded raster" in res.confidence_basis
