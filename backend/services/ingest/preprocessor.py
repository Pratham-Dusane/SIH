import math
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import Affine, from_bounds
from rasterio.warp import calculate_default_transform, reproject, transform_bounds
import scipy.ndimage

from core.sar import to_db


def _ensure_channel_first(arr: np.ndarray) -> np.ndarray:
    """Ensure array has shape (C, H, W)."""
    if arr.ndim == 2:
        return arr[np.newaxis, :, :]
    elif arr.ndim == 3:
        if arr.shape[0] in (1, 2, 3, 4, 8, 9, 10, 11, 12, 13, 16):
            return arr
        elif arr.shape[2] in (1, 2, 3, 4):
            return arr.transpose(2, 0, 1)
    return arr


def _select_rgb(out: np.ndarray, meta: Dict[str, Any]) -> np.ndarray:
    """Select 3 RGB channels from a multi-band optical raster."""
    c = out.shape[0]
    if c == 1:
        return np.repeat(out, 3, axis=0)
    elif c == 2:
        avg = (out[0] + out[1]) / 2.0
        return np.stack([out[0], out[1], avg], axis=0)
    elif c == 3:
        return out[:3]
    
    # Check for Sentinel-2 or band descriptions (B04=Red, B03=Green, B02=Blue)
    band_stats = meta.get("band_stats", [])
    desc_list = [(b.get("description") or "").upper() for b in band_stats]
    
    r_idx, g_idx, b_idx = -1, -1, -1
    for idx, desc in enumerate(desc_list):
        if "B4" in desc or "B04" in desc or "RED" in desc:
            r_idx = idx
        elif "B3" in desc or "B03" in desc or "GREEN" in desc:
            g_idx = idx
        elif "B2" in desc or "B02" in desc or "BLUE" in desc:
            b_idx = idx

    if r_idx >= 0 and g_idx >= 0 and b_idx >= 0:
        return np.stack([out[r_idx], out[g_idx], out[b_idx]], axis=0)

    # If 12/13 band Sentinel-2 standard indexing (B2=1, B3=2, B4=3 0-indexed)
    if c in (12, 13):
        return np.stack([out[3], out[2], out[1]], axis=0)

    # Default to first 3 bands
    return out[:3]


def prepare(meta: Dict[str, Any], arr: np.ndarray, modality: str) -> np.ndarray:
    """
    Prepare raw raster array into model-ready float32 tensor of shape (H, W, 3) in range [0, 1].
    SAR: dB conversion -> clip [-25, 5] -> 3x3 median filter -> normalise.
    Optical: per-band 2-98 percentile stretch -> RGB channel selection.
    """
    arr = _ensure_channel_first(arr).astype("float32")
    modality_upper = (modality or "OPTICAL").upper()

    if modality_upper == "SAR":
        # 1. amplitude/intensity -> dB, with calibration detection.
        #    A fixed [-25, 5] dB clip assumes calibrated sigma0.  An
        #    uncalibrated DN product (uint16, +17..+38 dB) lands entirely above
        #    that ceiling, so every pixel became 5.0 and the preview rendered as
        #    a pure white rectangle.  core.sar.to_db falls back to the raster's
        #    own percentile range when the product is not calibrated.
        db = np.stack([to_db(arr[b])[0] for b in range(arr.shape[0])], axis=0)
        # 2. speckle reduction via 3x3 median filter (preserves edges better than mean)
        filtered = np.stack([
            scipy.ndimage.median_filter(db[b], size=3) for b in range(db.shape[0])
        ], axis=0)
        # 3. normalise each band on its own dynamic range, so the stretch works
        #    for calibrated and uncalibrated products alike.
        out = np.empty_like(filtered, dtype="float32")
        for b in range(filtered.shape[0]):
            band = filtered[b]
            finite = band[np.isfinite(band)]
            lo, hi = (float(finite.min()), float(finite.max())) if finite.size else (0.0, 1.0)
            out[b] = 0.5 if hi - lo < 1e-9 else (band - lo) / (hi - lo)
        out = np.clip(np.nan_to_num(out, nan=0.0), 0.0, 1.0)
        # 5. channel mapping: 1 band -> grayscale RGB; 2 bands (VV, VH) -> [VV, VH, ratio]
        if out.shape[0] == 1:
            out = np.repeat(out, 3, axis=0)
        elif out.shape[0] >= 2:
            ratio = np.clip(out[0] - out[1] + 0.5, 0.0, 1.0)
            out = np.stack([out[0], out[1], ratio], axis=0)
    else:
        # Optical / Multispectral: 2-98 percentile stretch per band
        stretched_bands = []
        for b in range(arr.shape[0]):
            band = arr[b]
            lo, hi = np.nanpercentile(band, [2, 98])
            denom = max(hi - lo, 1e-6)
            stretched = np.clip((band - lo) / denom, 0.0, 1.0)
            stretched = np.nan_to_num(stretched, nan=0.0)
            stretched_bands.append(stretched)
        out = np.stack(stretched_bands, axis=0)
        out = _select_rgb(out, meta)

    # Return float32 HxWx3 in [0, 1]
    return out.astype("float32").transpose(1, 2, 0)


def align_pair(
    meta_a: Dict[str, Any],
    arr_a: np.ndarray,
    meta_b: Dict[str, Any],
    arr_b: np.ndarray,
    modality_a: str = "OPTICAL",
    modality_b: str = "SAR",
) -> Tuple[np.ndarray, np.ndarray, Dict[str, Any]]:
    """
    Align pair of images:
    1. Reproject image B into image A's CRS & grid (bilinear for optical, nearest for SAR).
    2. Crop both to the intersecting spatial bounding box.
    3. Resample both to the finer GSD.
    4. Return aligned arrays and the shared transform/CRS.
    """
    arr_a = _ensure_channel_first(arr_a)
    arr_b = _ensure_channel_first(arr_b)

    crs_a = meta_a.get("crs")
    crs_b = meta_b.get("crs")

    # If unreferenced, simple center crop / scale to common dimensions
    if not crs_a or not crs_b or not meta_a.get("transform") or not meta_b.get("transform"):
        min_h = min(arr_a.shape[1], arr_b.shape[1])
        min_w = min(arr_a.shape[2], arr_b.shape[2])
        shared_meta = {
            "crs": None,
            "transform": None,
            "width": min_w,
            "height": min_h,
            "bounds_native": None,
            "bounds_wgs84": None,
            "georeferenced": False,
        }
        return arr_a[:, :min_h, :min_w], arr_b[:, :min_h, :min_w], shared_meta

    src_transform_a = Affine(*meta_a["transform"][:6])
    src_transform_b = Affine(*meta_b["transform"][:6])

    # Determine resampling algorithm
    resample_b = Resampling.nearest if modality_b.upper() == "SAR" else Resampling.bilinear

    # Reproject image B into CRS A grid
    dst_b = np.zeros((arr_b.shape[0], arr_a.shape[1], arr_a.shape[2]), dtype=arr_b.dtype)
    for b in range(arr_b.shape[0]):
        reproject(
            source=arr_b[b],
            destination=dst_b[b],
            src_transform=src_transform_b,
            src_crs=crs_b,
            dst_transform=src_transform_a,
            dst_crs=crs_a,
            resampling=resample_b,
        )

    # Compute bounding intersection in CRS A
    bounds_a = meta_a.get("bounds_native")
    bounds_b_in_a = transform_bounds(crs_b, crs_a, *meta_b["bounds_native"]) if crs_a != crs_b else meta_b["bounds_native"]

    inter_w = max(bounds_a[0], bounds_b_in_a[0])
    inter_s = max(bounds_a[1], bounds_b_in_a[1])
    inter_e = min(bounds_a[2], bounds_b_in_a[2])
    inter_n = min(bounds_a[3], bounds_b_in_a[3])

    if inter_e <= inter_w or inter_n <= inter_s:
        # No overlap, return original grids
        inter_w, inter_s, inter_e, inter_n = bounds_a

    # Calculate pixel window in Image A space
    # Pixel coords: col = (x - x_origin) / gsd_x; row = (y_origin - y) / gsd_y
    orig_x, gsd_x, _, orig_y, _, gsd_y_neg = src_transform_a.to_gdal()
    gsd_y = abs(gsd_y_neg)

    col_min = max(0, int(math.floor((inter_w - orig_x) / gsd_x)))
    col_max = min(arr_a.shape[2], int(math.ceil((inter_e - orig_x) / gsd_x)))
    row_min = max(0, int(math.floor((orig_y - inter_n) / gsd_y)))
    row_max = min(arr_a.shape[1], int(math.ceil((orig_y - inter_s) / gsd_y)))

    cropped_a = arr_a[:, row_min:row_max, col_min:col_max]
    cropped_b = dst_b[:, row_min:row_max, col_min:col_max]

    # Compute new shared affine transform
    new_orig_x = orig_x + col_min * gsd_x
    new_orig_y = orig_y - row_min * gsd_y
    new_transform = Affine.translation(new_orig_x, new_orig_y) * Affine.scale(gsd_x, -gsd_y)

    shared_bounds_native = [inter_w, inter_s, inter_e, inter_n]
    shared_bounds_wgs84 = list(transform_bounds(crs_a, "EPSG:4326", *shared_bounds_native))

    shared_meta = {
        "crs": crs_a,
        "transform": list(new_transform)[:6],
        "width": cropped_a.shape[2],
        "height": cropped_a.shape[1],
        "bounds_native": shared_bounds_native,
        "bounds_wgs84": shared_bounds_wgs84,
        "gsd_m": meta_a.get("gsd_m"),
        "georeferenced": True,
    }

    return cropped_a, cropped_b, shared_meta


def tile_scene(
    arr: np.ndarray,
    tile_size: int = 1024,
    overlap: int = 128
) -> List[Dict[str, Any]]:
    """
    Tiling for large scenes (> 4096*4096). Splits array into overlapping tiles.
    """
    arr = _ensure_channel_first(arr)
    c, h, w = arr.shape
    stride = max(1, tile_size - overlap)
    tiles = []

    tile_row_idx = 0
    for y_min in range(0, h, stride):
        y_max = min(h, y_min + tile_size)
        tile_col_idx = 0
        for x_min in range(0, w, stride):
            x_max = min(w, x_min + tile_size)
            tile_arr = arr[:, y_min:y_max, x_min:x_max]
            tiles.append({
                "tile_id": f"tile_r{tile_row_idx}_c{tile_col_idx}",
                "row_idx": tile_row_idx,
                "col_idx": tile_col_idx,
                "bbox_px": [x_min, y_min, x_max, y_max],
                "shape": list(tile_arr.shape),
                "array": tile_arr,
            })
            tile_col_idx += 1
            if x_max == w:
                break
        tile_row_idx += 1
        if y_max == h:
            break

    return tiles
