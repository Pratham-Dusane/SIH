import pytest
from services.ingest.modality_detector import detect_modality


def test_detect_sar_sentinel1():
    """Test detection of SAR raster from Sentinel-1 metadata and stats."""
    meta = {
        "band_count": 2,
        "dtypes": ["float32", "float32"],
        "tags": {"platform": "Sentinel-1A", "polarisation": "VV VH"},
        "band_stats": [
            {"index": 1, "mean": 0.05, "std": 0.06, "description": "VV"},  # CV = 1.2 > 0.8
            {"index": 2, "mean": 0.02, "std": 0.03, "description": "VH"},
        ],
    }
    res = detect_modality(meta)
    assert res["modality"] == "SAR"
    assert res["confidence"] >= 0.50
    assert res["is_ambiguous"] is False
    assert any("SAR" in e for e in res["evidence"])


def test_detect_optical_rgb():
    """Test detection of 3-band RGB optical image."""
    meta = {
        "band_count": 3,
        "dtypes": ["uint8", "uint8", "uint8"],
        "tags": {"sensor": "Cartosat-2"},
        "band_stats": [
            {"index": 1, "mean": 120.0, "std": 30.0, "description": "Red"},  # CV = 0.25 < 0.5
            {"index": 2, "mean": 115.0, "std": 28.0, "description": "Green"},
            {"index": 3, "mean": 110.0, "std": 25.0, "description": "Blue"},
        ],
    }
    res = detect_modality(meta)
    assert res["modality"] == "OPTICAL"
    assert res["confidence"] >= 0.50
    assert res["is_ambiguous"] is False


def test_detect_multispectral_sentinel2():
    """Test detection of Sentinel-2 multispectral product."""
    meta = {
        "band_count": 12,
        "dtypes": ["uint16"] * 12,
        "tags": {"platform": "Sentinel-2B"},
        "band_stats": [
            {"index": i, "mean": 1500.0, "std": 400.0, "description": f"B{i:02d}"}
            for i in range(1, 13)
        ],
    }
    res = detect_modality(meta)
    assert res["modality"] == "MULTISPECTRAL"
    assert res["confidence"] >= 0.50
    assert res["is_ambiguous"] is False


def test_detect_ambiguous_case():
    """Test that a single-band raster with conflicting/unclear signals is flagged AMBIGUOUS."""
    meta = {
        "band_count": 1,  # SAR hint (+0.2)
        "dtypes": ["uint8"],  # Optical hint (+0.1)
        "tags": {},
        "band_stats": [
            {"index": 1, "mean": 100.0, "std": 60.0, "description": ""},  # CV = 0.6 (between 0.5 and 0.8)
        ],
    }
    # SAR score ~ 0.2, Opt score ~ 0.1 -> conf = (0.2-0.1)/0.3 = 0.333 < 0.35
    res = detect_modality(meta)
    assert res["modality"] == "AMBIGUOUS"
    assert res["is_ambiguous"] is True
    assert res["confidence"] < 0.35
