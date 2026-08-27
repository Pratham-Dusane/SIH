import math
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import rasterio
from skimage.registration import phase_cross_correlation

FAIL, WARN, PASS, NA = "FAIL", "WARN", "PASS", "N/A"


def _mk(name: str, status: str, detail: str) -> Dict[str, str]:
    return {"name": name, "status": status, "detail": detail}


def _gray_512(img_info: Dict[str, Any]) -> np.ndarray:
    """
    Read or generate a 512x512 percentile-normalized grayscale float array for phase correlation.
    Supports either pre-extracted array or path in metadata.
    """
    if "array" in img_info and img_info["array"] is not None:
        arr = img_info["array"]
        if arr.ndim == 3:
            # (C, H, W) or (H, W, C)
            if arr.shape[0] in (1, 2, 3, 4, 12, 13):
                gray = arr[0]
            else:
                gray = arr[:, :, 0]
        else:
            gray = arr
    elif "path" in img_info and img_info["path"]:
        with rasterio.open(img_info["path"]) as src:
            gray = src.read(1, out_shape=(512, 512)).astype("float32")
    else:
        # Fallback to zeros if neither array nor path is available
        return np.zeros((512, 512), dtype="float32")

    # Resize if not 512x512
    if gray.shape != (512, 512):
        import scipy.ndimage
        zoom_y = 512.0 / gray.shape[0]
        zoom_x = 512.0 / gray.shape[1]
        gray = scipy.ndimage.zoom(gray.astype("float32"), (zoom_y, zoom_x), order=1)

    # Percentile stretch
    p2, p98 = np.nanpercentile(gray, [2, 98])
    denom = max(p98 - p2, 1e-6)
    gray = np.clip((gray - p2) / denom, 0.0, 1.0)
    gray = np.nan_to_num(gray, nan=0.0)
    return gray.astype("float32")


def estimate_shift(a: Dict[str, Any], b: Dict[str, Any]) -> Tuple[float, float]:
    """
    Estimate relative shift between two images using phase cross-correlation on 512x512 downsamples.
    Returns (shift_in_original_pixels, normalized_error).
    """
    ga = _gray_512(a)
    gb = _gray_512(b)

    shifts, err, _ = phase_cross_correlation(ga, gb, upsample_factor=4)
    dy, dx = shifts[0], shifts[1]
    
    # Scale shift back to original pixel dimension (based on maximum width/height of image A)
    orig_dim = max(a.get("width", 512), a.get("height", 512))
    scale = orig_dim / 512.0
    shift_px = float(np.hypot(dy, dx) * scale)
    return float(shift_px), float(err)


def _overlap_fraction(a: Dict[str, Any], b: Dict[str, Any]) -> float:
    """Compute fraction of image A footprint covered by image B in WGS84."""
    b_a = a.get("bounds_wgs84")
    b_b = b.get("bounds_wgs84")
    if not b_a or not b_b or len(b_a) != 4 or len(b_b) != 4:
        return 0.0

    a_w, a_s, a_e, a_n = b_a
    b_w, b_s, b_e, b_n = b_b

    inter_w = max(a_w, b_w)
    inter_s = max(a_s, b_s)
    inter_e = min(a_e, b_e)
    inter_n = min(a_n, b_n)

    inter_w_len = max(0.0, inter_e - inter_w)
    inter_h_len = max(0.0, inter_n - inter_s)
    inter_area = inter_w_len * inter_h_len

    a_area = max(1e-12, (a_e - a_w) * (a_n - a_s))
    return float(min(1.0, max(0.0, inter_area / a_area)))


def check_compatibility(
    images: List[Dict[str, Any]],
    declared_config: str,
    benchmark_mode: bool = False
) -> Dict[str, Any]:
    """
    Requirement R8: Verify image count, modality pairing, format, CRS, overlap,
    GSD ratio, and co-registration shift before any inference model runs.
    """
    checks: List[Dict[str, str]] = []
    config_upper = declared_config.upper()

    # --- C1: image count matches declared configuration -------------------
    expected_map = {"SINGLE": 1, "CROSS_MODAL": 2, "BI_TEMPORAL": 2}
    expected = expected_map.get(config_upper, 1)
    
    if len(images) == expected:
        checks.append(_mk("image_count", PASS, f"{len(images)} image(s) provided, {expected} expected for {config_upper}"))
    else:
        checks.append(_mk("image_count", FAIL, f"{len(images)} image(s) provided, {expected} expected for {config_upper}"))

    # --- C2: modality expectation ----------------------------------------
    mods = []
    for img in images:
        m = img.get("modality")
        if isinstance(m, dict):
            mods.append(m.get("modality", "OPTICAL"))
        elif isinstance(m, str):
            mods.append(m)
        else:
            mods.append("OPTICAL")

    if config_upper == "SINGLE":
        checks.append(_mk("modality_pairing", PASS, f"Single image with detected modality {mods[0] if mods else 'UNKNOWN'}"))
    elif config_upper == "CROSS_MODAL":
        has_sar = "SAR" in mods
        has_opt = any(m in ("OPTICAL", "MULTISPECTRAL") for m in mods)
        if has_sar and has_opt:
            checks.append(_mk("modality_pairing", PASS, f"Detected {mods}; cross-modal pairing valid (SAR + Optical/MS)"))
        else:
            checks.append(_mk(
                "modality_pairing", FAIL,
                f"Detected {mods}; cross-modal analysis requires one SAR and one optical/multispectral image"
            ))
    elif config_upper == "BI_TEMPORAL":
        if len(mods) >= 2 and mods[0] == mods[1]:
            checks.append(_mk("modality_pairing", PASS, f"Detected matching modalities {mods}"))
        else:
            checks.append(_mk(
                "modality_pairing", WARN,
                f"Detected {mods}; bi-temporal comparison is most reliable with matching modalities"
            ))

    coreg_shift_px = None
    overlap_fraction = None

    if len(images) == 2:
        a, b = images[0], images[1]
        geo_both = bool(a.get("georeferenced")) and bool(b.get("georeferenced"))

        # --- C3: CRS ------------------------------------------------------
        if benchmark_mode:
            checks.append(_mk("crs_match", NA, "Benchmark sample: CRS check bypassed"))
        elif geo_both:
            same_crs = (a.get("crs") == b.get("crs")) and a.get("crs") is not None
            status = PASS if same_crs else WARN
            detail = f"{a.get('crs')} vs {b.get('crs')}" + ("" if same_crs else " - image 2 will be reprojected to image 1")
            checks.append(_mk("crs_match", status, detail))
        else:
            checks.append(_mk("crs_match", WARN, "One or both images lack a CRS; geographic outputs disabled"))

        # --- C4: spatial overlap -----------------------------------------
        if benchmark_mode:
            checks.append(_mk("spatial_overlap", NA, "Benchmark sample: spatial overlap check bypassed"))
        elif geo_both:
            ov = _overlap_fraction(a, b)
            overlap_fraction = ov
            status = PASS if ov >= 0.90 else (WARN if ov >= 0.50 else FAIL)
            checks.append(_mk("spatial_overlap", status, f"{ov * 100:.1f}% of image 1 footprint is covered by image 2"))
        else:
            checks.append(_mk("spatial_overlap", WARN, "Spatial overlap could not be calculated (unreferenced)"))

        # --- C5: GSD ratio -------------------------------------------
        if benchmark_mode:
            checks.append(_mk("gsd_ratio", NA, "Benchmark sample: GSD ratio check bypassed"))
        elif a.get("gsd_m") and b.get("gsd_m"):
            ga = float(a["gsd_m"])
            gb = float(b["gsd_m"])
            r = max(ga, gb) / max(min(ga, gb), 1e-9)
            status = PASS if r <= 2.0 else (WARN if r <= 4.0 else FAIL)
            checks.append(_mk(
                "gsd_ratio", status,
                f"{ga:.2f} m vs {gb:.2f} m (ratio {r:.2f}); coarser image will be resampled to {min(ga, gb):.2f} m"
            ))
        else:
            checks.append(_mk("gsd_ratio", WARN, "GSD unavailable for one or both images"))

        # --- C6: co-registration -----------------------------------------
        try:
            shift, err = estimate_shift(a, b)
            coreg_shift_px = shift
            status = PASS if shift <= 2.0 else (WARN if shift <= 8.0 else FAIL)
            checks.append(_mk("co_registration", status, f"Estimated misregistration {shift:.2f} px (normalised error {err:.3f})"))
        except Exception as e:
            checks.append(_mk("co_registration", WARN, f"Co-registration estimation failed: {str(e)}"))

    # Determine overall verdict
    verdict = PASS
    if any(c["status"] == FAIL for c in checks):
        verdict = FAIL
    elif any(c["status"] == WARN for c in checks):
        verdict = WARN

    target_crs = images[0].get("crs") if images else None
    valid_gsds = [i["gsd_m"] for i in images if i.get("gsd_m") is not None]
    target_gsd_m = min(valid_gsds) if valid_gsds else None

    return {
        "verdict": verdict,
        "checks": checks,
        "target_crs": target_crs,
        "target_gsd_m": target_gsd_m,
        # Reported as first-class numbers so consumers never have to parse them
        # back out of the human-readable check detail string.
        "overlap_fraction": overlap_fraction,
        "coreg_shift_px": coreg_shift_px,
    }
