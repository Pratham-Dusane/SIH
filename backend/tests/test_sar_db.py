"""
Regression tests for SAR dB conversion (tools/_sar_db.py).

The bug these exist to prevent: a fixed calibrated clip range applied to an
uncalibrated DN product collapses the raster to a single value, after which
every threshold silently returns False. The tool then reports "0% water, 0%
built-up, 100% sensor conflict" from imagery that was perfectly usable - a
wrong answer delivered with no error anywhere.
"""

import asyncio

import numpy as np
import pytest

from core.sar import is_degenerate, to_db


def run(coro):
    return asyncio.run(coro)


def test_uncalibrated_dn_is_not_flattened():
    """uint16 DN 54..5891 -> +17..+38 dB, outside any calibrated envelope."""
    rng = np.random.default_rng(0)
    dn = rng.integers(54, 5891, size=(192, 192)).astype("uint16")

    db, calibrated = to_db(dn)

    assert calibrated is False, "raw DN must not be reported as calibrated"
    assert not is_degenerate(db), "conversion collapsed the raster to a constant"
    assert np.ptp(db) > 5.0, f"expected real dynamic range, got {np.ptp(db):.3f} dB"


def test_calibrated_backscatter_is_recognised_and_clipped():
    """Linear sigma0 around 0-1 lands in the calibrated envelope."""
    rng = np.random.default_rng(1)
    sigma0 = rng.uniform(0.001, 0.9, size=(128, 128))

    db, calibrated = to_db(sigma0)

    assert calibrated is True
    assert db.min() >= -35.0 and db.max() <= 10.0
    assert not is_degenerate(db)


def test_thresholds_survive_on_uncalibrated_data():
    """
    Otsu and percentile thresholds are relative, so they must still partition
    an uncalibrated raster - this is what actually broke.
    """
    rng = np.random.default_rng(2)
    dn = rng.integers(54, 5891, size=(192, 192)).astype("uint16")
    db, _ = to_db(dn)

    built = db > np.percentile(db, 90)
    # A 90th-percentile threshold selects ~10% by construction. Zero means the
    # distribution was flattened.
    assert 0.05 < built.mean() < 0.15, f"percentile threshold degenerate: {built.mean()}"


def test_degenerate_raster_is_reported_not_silently_accepted():
    flat = np.full((64, 64), 500, dtype="uint16")
    db, _ = to_db(flat)
    assert is_degenerate(db)

    assert is_degenerate(np.array([]))


def _real_pair_ctx(tmp_path):
    """Optical + SAR scene backed by synthetic rasters with real characteristics."""
    import rasterio
    from rasterio.transform import from_origin

    from agent.context import ExecutionContext
    from models.scene import (CompatibilityReport, ModalityResult, RasterMetadata,
                              Scene, SceneImage)
    from services.ingest.modality_detector import detect_modality
    from services.ingest.raster_reader import read_metadata

    rng = np.random.default_rng(3)
    transform = from_origin(73.8417, 18.4668, 9.2589e-05, 9.2589e-05)

    opt_path = tmp_path / "opt.tif"
    opt = rng.integers(20, 250, size=(3, 195, 195)).astype("uint8")
    with rasterio.open(opt_path, "w", driver="GTiff", height=195, width=195,
                       count=3, dtype="uint8", crs="EPSG:4326",
                       transform=transform) as d:
        d.write(opt)

    sar_path = tmp_path / "sar.tif"
    # Uncalibrated DN, exactly the case that used to flatten.
    sar = rng.integers(54, 5891, size=(192, 192)).astype("uint16")
    with rasterio.open(sar_path, "w", driver="GTiff", height=192, width=192,
                       count=1, dtype="uint16", crs="EPSG:4326",
                       transform=transform) as d:
        d.write(sar, 1)

    def mk(role, path):
        m = read_metadata(str(path))
        return SceneImage(role=role, original_filename=path.name,
                          object_path=str(path), metadata=RasterMetadata(**m),
                          modality=ModalityResult(**detect_modality(m)))

    scene = Scene(id="t", workspace_id="ws", name="cm", input_config="CROSS_MODAL",
                  images=[mk("optical", opt_path), mk("sar", sar_path)],
                  compatibility=CompatibilityReport(verdict="PASS", checks=[]),
                  modalities=["OPTICAL", "SAR"], coreg_shift_px=0.85,
                  created_at="2026-08-28T00:00:00Z")

    class _Storage:
        def local_path(self, p):
            return p

    return ExecutionContext(scene=scene, storage=_Storage())


def test_fusion_produces_live_sar_fractions_on_uncalibrated_input(tmp_path):
    """End-to-end: the SAR half of the fusion must contribute something."""
    from tools.sar_optical_fuse import FuseParams, SAROpticalFuseTool

    ctx = _real_pair_ctx(tmp_path)
    res = run(SAROpticalFuseTool().run(ctx, FuseParams()))

    f = res.facts
    assert f["water_fraction_sar"] > 0.0, "SAR water mask is empty - dB was flattened"
    assert f["built_fraction_sar"] > 0.0, "SAR built mask is empty - dB was flattened"
    # 90th-percentile threshold selects ~10% by construction.
    assert 0.05 < f["built_fraction_sar"] < 0.15

    assert f["sar_calibrated"] is False
    assert any("not calibrated backscatter" in w for w in res.warnings), (
        "uncalibrated input must be disclosed, not silently used")
    assert "uncalibrated" in res.confidence_basis

    assert set(res.artifacts) == {"water_mask", "built_mask", "conflict_mask"}


def test_sar_water_mask_is_not_empty_on_uncalibrated_input(tmp_path):
    from tools.sar_water_mask import SARWaterMaskParams, SARWaterMaskTool

    ctx = _real_pair_ctx(tmp_path)
    res = run(SARWaterMaskTool().run(ctx, SARWaterMaskParams()))

    assert 0.0 < res.facts["water_fraction"] < 1.0, (
        f"degenerate water fraction {res.facts['water_fraction']}")
    assert any("not calibrated backscatter" in w for w in res.warnings)


# ---------------------------------------------------------------------------
# Preview generation.
#
# The same fixed-calibrated-range assumption lived in the preview stretch:
# clip(db, -25, 5) then (db + 25) / 30. An uncalibrated uint16 product sits
# entirely above that ceiling, so every pixel became 1.0 and the SAR preview
# rendered as a pure white rectangle - which is what the blend view showed.
# ---------------------------------------------------------------------------
def test_sar_preview_is_not_a_white_rectangle():
    from services.ingest.preprocessor import prepare

    rng = np.random.default_rng(5)
    # uint16 DN, the range that used to saturate.
    arr = rng.integers(54, 5891, size=(1, 192, 192)).astype("uint16")

    out = prepare({}, arr, "SAR")
    u8 = np.clip(out * 255, 0, 255).astype("uint8")

    assert u8.min() < 250, "SAR preview saturated to white"
    assert len(np.unique(u8)) > 32, (
        f"SAR preview has only {len(np.unique(u8))} distinct levels")
    assert u8.shape[-1] == 3, "single-pol SAR should render as grayscale RGB"


def test_calibrated_sar_preview_still_renders():
    """The fix must not regress genuinely calibrated sigma0 input."""
    from services.ingest.preprocessor import prepare

    rng = np.random.default_rng(6)
    sigma0 = rng.uniform(0.001, 0.9, size=(1, 128, 128)).astype("float32")

    u8 = np.clip(prepare({}, sigma0, "SAR") * 255, 0, 255).astype("uint8")
    assert u8.min() < 250 and len(np.unique(u8)) > 32


def test_flat_sar_preview_does_not_divide_by_zero():
    from services.ingest.preprocessor import prepare

    flat = np.full((1, 64, 64), 500, dtype="uint16")
    out = prepare({}, flat, "SAR")
    assert np.all(np.isfinite(out)), "degenerate raster produced NaN/inf"
    assert 0.0 <= out.min() and out.max() <= 1.0
