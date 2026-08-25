import math
from pathlib import Path
from typing import Any, Dict, Optional
import numpy as np
import rasterio
from rasterio.warp import transform_bounds

ALLOWED_GEO = {".tif", ".tiff"}
ALLOWED_BENCHMARK = {".png", ".jpg", ".jpeg"}


class UnsupportedFormat(Exception):
    pass


def read_metadata(path: str, benchmark_mode: bool = False) -> Dict[str, Any]:
    """
    Open any accepted raster input and extract complete, honest metadata.
    Never guess a value that is absent - return None and let the compatibility checker decide.
    """
    ext = Path(path).suffix.lower()
    if ext in ALLOWED_BENCHMARK and not benchmark_mode:
        raise UnsupportedFormat(
            f"{ext} is accepted only for prescribed public benchmark samples. "
            "Upload GeoTIFF/TIFF, or enable benchmark mode."
        )
    if ext not in ALLOWED_GEO | ALLOWED_BENCHMARK:
        raise UnsupportedFormat(f"Unsupported format {ext}. Expected GeoTIFF/TIFF.")

    with rasterio.open(path) as src:
        is_rectilinear = True
        if hasattr(src.transform, "is_rectilinear"):
            is_rectilinear = src.transform.is_rectilinear
        else:
            is_rectilinear = abs(src.transform.b) < 1e-9 and abs(src.transform.d) < 1e-9

        georeferenced = src.crs is not None and is_rectilinear
        bounds_native = list(src.bounds) if georeferenced else None
        bounds_wgs84 = None
        gsd_x = abs(src.transform.a) if (georeferenced and src.transform.a != 0) else None
        gsd_y = abs(src.transform.e) if (georeferenced and src.transform.e != 0) else None
        gsd_native = (gsd_x + gsd_y) / 2.0 if (gsd_x is not None and gsd_y is not None) else None
        gsd_m = None

        if georeferenced and src.crs:
            try:
                bounds_wgs84 = list(transform_bounds(src.crs, "EPSG:4326", *src.bounds))
                
                # Check if CRS is geographic (degrees) or projected (linear meters)
                is_geographic = getattr(src.crs, "is_geographic", False)
                if not is_geographic:
                    # Fallback check for EPSG 4326 or degree units
                    crs_str = src.crs.to_string().lower()
                    if "4326" in crs_str or "degree" in crs_str or "wgs 84" in crs_str:
                        is_geographic = True

                if is_geographic and bounds_wgs84 and gsd_x is not None and gsd_y is not None:
                    lat_center = (bounds_wgs84[1] + bounds_wgs84[3]) / 2.0
                    lat_rad = math.radians(lat_center)
                    gsd_x_m = gsd_x * 111320.0 * math.cos(lat_rad)
                    gsd_y_m = gsd_y * 110540.0
                    gsd_m = float((gsd_x_m + gsd_y_m) / 2.0)
                elif gsd_native is not None:
                    gsd_m = float(gsd_native)
            except Exception:
                bounds_wgs84 = None
                gsd_m = gsd_native

        band_stats = []
        for i in range(1, src.count + 1):
            out_h = min(src.height, 512)
            out_w = min(src.width, 512)
            arr = src.read(i, out_shape=(out_h, out_w))
            arr = arr.astype("float64")
            
            if src.nodata is not None:
                arr = np.where(arr == src.nodata, np.nan, arr)

            # Filter out non-finite numbers
            arr = np.where(np.isfinite(arr), arr, np.nan)
            
            if np.all(np.isnan(arr)):
                b_min = b_max = b_mean = b_std = 0.0
            else:
                b_min = float(np.nanmin(arr))
                b_max = float(np.nanmax(arr))
                b_mean = float(np.nanmean(arr))
                b_std = float(np.nanstd(arr))

            description = None
            if src.descriptions and len(src.descriptions) >= i:
                description = src.descriptions[i - 1]

            band_stats.append({
                "index": i,
                "dtype": str(src.dtypes[i - 1]),
                "min": b_min,
                "max": b_max,
                "mean": b_mean,
                "std": b_std,
                "description": description,
            })

        transform_list = list(src.transform)[:6] if georeferenced else None

        return {
            "driver": src.driver,
            "width": src.width,
            "height": src.height,
            "band_count": src.count,
            "dtypes": [str(d) for d in src.dtypes],
            "crs": src.crs.to_string() if src.crs else None,
            "transform": transform_list,
            "bounds_native": bounds_native,
            "bounds_wgs84": bounds_wgs84,
            "gsd_x": gsd_x,
            "gsd_y": gsd_y,
            "gsd_native": gsd_native,
            "gsd_m": gsd_m,
            "nodata": src.nodata,
            "georeferenced": georeferenced,
            "tags": dict(src.tags()),
            "band_stats": band_stats,
        }
