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


def _same_modality(a: Dict[str, Any], b: Dict[str, Any]) -> bool:
    def _m(img):
        m = img.get("modality")
        if isinstance(m, dict):
            return m.get("modality", "")
        return m or ""
    ma, mb = _m(a), _m(b)
    optical = {"OPTICAL", "MULTISPECTRAL"}
    if ma in optical and mb in optical:
        return True
    return ma == mb


def shift_from_geotransform(a: Dict[str, Any], b: Dict[str, Any]) -> Optional[float]:
    """
    Misregistration in pixels, read straight off the two geotransforms.

    For georeferenced products this is the *exact* answer and it is completely
    modality-independent — the grid origins either line up or they do not.
    Returns None when either image lacks a usable footprint.
    """
    ba, bb = a.get("bounds_wgs84"), b.get("bounds_wgs84")
    if not ba or not bb or len(ba) != 4 or len(bb) != 4:
        return None
    aw, a_s, ae, an = (float(v) for v in ba)
    bw, _bs, _be, bn = (float(v) for v in bb)

    width = max(int(a.get("width") or 0), 1)
    height = max(int(a.get("height") or 0), 1)
    px_w = (ae - aw) / width
    px_h = (an - a_s) / height
    if abs(px_w) < 1e-15 or abs(px_h) < 1e-15:
        return None

    dx = (bw - aw) / px_w
    dy = (bn - an) / px_h
    return float(np.hypot(dx, dy))


def estimate_shift(a: Dict[str, Any], b: Dict[str, Any]) -> Tuple[float, float]:
    """
    Estimate relative shift by phase cross-correlation on 512x512 downsamples.
    Returns (shift_in_original_pixels, normalized_error).

    **Only valid for same-modality pairs.**  Optical and SAR measure different
    physics, so correlating their raw intensities produces noise — see
    `co_registration_estimate` for how that case is handled.
    """
    ga = _gray_512(a)
    gb = _gray_512(b)

    if not _same_modality(a, b):
        # Structural (edge) content is the only thing an optical and a SAR
        # image share, so correlate gradient magnitude rather than intensity.
        ga, gb = _gradient_magnitude(ga), _gradient_magnitude(gb)

    shifts, err, _ = phase_cross_correlation(ga, gb, upsample_factor=4)
    dy, dx = shifts[0], shifts[1]

    # Scale shift back to original pixel dimension (based on maximum width/height of image A)
    orig_dim = max(a.get("width", 512), a.get("height", 512))
    scale = orig_dim / 512.0
    shift_px = float(np.hypot(dy, dx) * scale)
    return float(shift_px), float(err)


def _gradient_magnitude(g: np.ndarray) -> np.ndarray:
    """Normalised Sobel gradient magnitude — a modality-invariant structure map."""
    gy, gx = np.gradient(g.astype("float64"))
    mag = np.hypot(gx, gy)
    peak = np.percentile(mag, 99) if mag.size else 0.0
    if peak > 0:
        mag = np.clip(mag / peak, 0.0, 1.0)
    return mag.astype("float32")


def co_registration_estimate(a: Dict[str, Any], b: Dict[str, Any]) -> Tuple[Optional[float], str, str]:
    """
    Misregistration in pixels plus how it was obtained: (shift_px, method, note).

    Two independent things can be misaligned, and they are not the same:

    * **grid offset** — the geotransforms disagree.  Exact, and completely
      modality-independent.
    * **content offset** — the geotransforms agree but the imagery does not,
      i.e. the product's own georeferencing is wrong.  Only detectable by
      correlating pixels, which is meaningful *within* a modality.

    Same-modality pairs are checked both ways and the worse number wins, since
    either kind of offset breaks change detection.  For a cross-modal pair,
    optical and SAR measure different physics, so intensity correlation between
    them is noise — the geotransform is the only trustworthy signal, and noise
    must never be allowed to FAIL a well-georeferenced scene.

    `shift_px` is None when no trustworthy estimate exists; the caller reports
    that as unknown rather than inventing a number.
    """
    geo_both = bool(a.get("georeferenced") and a.get("bounds_wgs84")
                    and b.get("georeferenced") and b.get("bounds_wgs84"))
    same_modality = _same_modality(a, b)

    geo_shift = shift_from_geotransform(a, b) if geo_both else None

    # Cross-modal + georeferenced: trust the grid, ignore correlation entirely.
    if geo_shift is not None and not same_modality:
        return geo_shift, "geotransform", (
            "grid origins compared directly; intensity correlation is not "
            "meaningful between optical and SAR")

    corr_shift = None
    corr_note = ""
    try:
        corr_shift, err = estimate_shift(a, b)
        corr_note = f"normalised error {err:.3f}"
    except Exception as e:  # noqa: BLE001
        corr_note = f"correlation failed: {e}"

    if geo_shift is not None and corr_shift is not None:
        # Both available and comparable — the larger offset is the real problem.
        if corr_shift >= geo_shift:
            return corr_shift, "phase_correlation", (
                f"image content offset by {corr_shift:.2f} px while the geotransforms "
                f"differ by only {geo_shift:.2f} px — the georeferencing may be wrong")
        return geo_shift, "geotransform", (
            f"grid origins differ by {geo_shift:.2f} px; image content agrees "
            f"to {corr_shift:.2f} px")

    if geo_shift is not None:
        return geo_shift, "geotransform", "grid origins compared directly"

    if corr_shift is None:
        return None, "unavailable", corr_note

    # No usable georeferencing (benchmark PNGs, unreferenced products).
    if not same_modality:
        return corr_shift, "gradient_correlation", (
            "cross-modal pair with no georeferencing — estimated from edge "
            "structure, treat as indicative only")
    return corr_shift, "phase_correlation", corr_note


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
        shift, method, note = co_registration_estimate(a, b)
        coreg_shift_px = shift

        if shift is None:
            checks.append(_mk("co_registration", WARN,
                              f"Co-registration could not be estimated ({note})"))
        elif method == "gradient_correlation":
            # Cross-modal edge correlation with no georeferencing to fall back
            # on: indicative only, so it may warn but must never fail a scene.
            status = PASS if shift <= 2.0 else WARN
            checks.append(_mk("co_registration", status,
                              f"Estimated misregistration {shift:.2f} px — {note}"))
        else:
            status = PASS if shift <= 2.0 else (WARN if shift <= 8.0 else FAIL)
            checks.append(_mk("co_registration", status,
                              f"Misregistration {shift:.2f} px — {note}"))

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
