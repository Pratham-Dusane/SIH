import numpy as np
import pytest
from services.ingest.preprocessor import prepare, align_pair, tile_scene


def test_prepare_sar_pipeline():
    """Test SAR preprocessor: dB conversion, speckle median filtering, and channel format."""
    # Synthetic SAR amplitude 2-band (VV, VH)
    raw_sar = np.random.exponential(scale=0.1, size=(2, 64, 64)).astype(np.float32)
    meta = {"band_count": 2, "band_stats": []}

    prepared = prepare(meta, raw_sar, modality="SAR")

    assert prepared.shape == (64, 64, 3)
    assert prepared.dtype == np.float32
    assert np.all(prepared >= 0.0)
    assert np.all(prepared <= 1.0)


def test_prepare_optical_percentile_stretch():
    """Test Optical preprocessor: 2-98 percentile stretch and channel format."""
    raw_opt = (np.random.normal(loc=500, scale=100, size=(3, 64, 64))).astype(np.float32)
    # Add an extreme outlier (cloud/nodata)
    raw_opt[0, 0, 0] = 10000.0
    meta = {"band_count": 3, "band_stats": []}

    prepared = prepare(meta, raw_opt, modality="OPTICAL")

    assert prepared.shape == (64, 64, 3)
    assert prepared.dtype == np.float32
    assert np.all(prepared >= 0.0)
    assert np.all(prepared <= 1.0)


def test_align_pair_and_transform():
    """Test pair alignment: crops and returns shared transform."""
    # Image A in UTM EPSG:32643
    meta_a = {
        "crs": "EPSG:32643",
        "transform": [10.0, 0.0, 300000.0, 0.0, -10.0, 2200000.0],
        "bounds_native": [300000.0, 2199000.0, 301000.0, 2200000.0],
        "gsd_m": 10.0,
        "georeferenced": True,
        "width": 100,
        "height": 100,
    }
    arr_a = np.ones((3, 100, 100), dtype=np.float32)

    # Image B partially overlapping in same CRS
    meta_b = {
        "crs": "EPSG:32643",
        "transform": [10.0, 0.0, 300500.0, 0.0, -10.0, 2200000.0],
        "bounds_native": [300500.0, 2199000.0, 301500.0, 2200000.0],
        "gsd_m": 10.0,
        "georeferenced": True,
        "width": 100,
        "height": 100,
    }
    arr_b = np.ones((1, 100, 100), dtype=np.float32) * 2.0

    aligned_a, aligned_b, shared_meta = align_pair(
        meta_a, arr_a, meta_b, arr_b, modality_a="OPTICAL", modality_b="SAR"
    )

    assert shared_meta["georeferenced"] is True
    assert shared_meta["crs"] == "EPSG:32643"
    assert aligned_a.shape[1] == aligned_b.shape[1]
    assert aligned_a.shape[2] == aligned_b.shape[2]
    assert shared_meta["bounds_wgs84"] is not None


def test_tiling():
    """Test scene tiling with overlap."""
    large_arr = np.zeros((3, 2048, 2048), dtype=np.float32)
    tiles = tile_scene(large_arr, tile_size=1024, overlap=128)

    assert len(tiles) > 1
    assert tiles[0]["shape"] == [3, 1024, 1024]
    assert "bbox_px" in tiles[0]
