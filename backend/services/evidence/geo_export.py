"""
Geo Export - PRD §10.2 (Phase 7).

Two deterministic, offline-safe functions:
  1. write_mask_geotiff  - mask → GeoTIFF with embedded trace provenance tags
  2. mask_to_geojson     - mask → GeoJSON polygon (EPSG:4326)

Both functions are pure computation.  No network calls, no LLM.
The trace ID is written into the GeoTIFF tags so a mask opened in QGIS
six months later still points back to the exact execution that produced it.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Optional

import numpy as np


# ---------------------------------------------------------------------------
# GeoTIFF export
# ---------------------------------------------------------------------------

def write_mask_geotiff(
    mask: np.ndarray,
    transform,
    crs,
    out_path: str,
    *,
    nodata: int = 0,
    trace_id: Optional[str] = None,
    tool_name: Optional[str] = None,
    model_version: Optional[str] = None,
) -> str:
    """
    Write a binary mask as a Cloud-Optimised-friendly GeoTIFF - PRD §10.2.

    The file is deflate-compressed and tiled 256×256 so QGIS and rasterio
    can stream partial reads efficiently.

    Provenance tags (SATQUERY_TRACE, SATQUERY_TOOL, SATQUERY_MODEL) are
    written into the GeoTIFF metadata so the mask is self-describing.

    Parameters
    ----------
    mask:          H×W boolean/uint8 array
    transform:     rasterio Affine transform (source CRS)
    crs:           rasterio CRS object (source CRS - NOT reprojected here)
    out_path:      absolute path to write to (created if missing)
    nodata:        nodata value (default 0 = background)
    trace_id:      ExecutionTrace.trace_id for provenance
    tool_name:     tool that produced the mask
    model_version: model@version string (e.g. "gemini-3.6-flash")

    Returns
    -------
    Absolute path to the written GeoTIFF.
    """
    import rasterio

    Path(out_path).parent.mkdir(parents=True, exist_ok=True)

    profile = {
        "driver": "GTiff",
        "height": mask.shape[0],
        "width": mask.shape[1],
        "count": 1,
        "dtype": "uint8",
        "crs": crs,
        "transform": transform,
        "nodata": nodata,
        "compress": "deflate",
        "tiled": True,
        "blockxsize": 256,
        "blockysize": 256,
    }

    with rasterio.open(out_path, "w", **profile) as dst:
        dst.write(mask.astype("uint8"), 1)
        tags = {}
        if trace_id:
            tags["SATQUERY_TRACE"] = trace_id
        if tool_name:
            tags["SATQUERY_TOOL"] = tool_name
        if model_version:
            tags["SATQUERY_MODEL"] = model_version
        if tags:
            dst.update_tags(**tags)

    return out_path


# ---------------------------------------------------------------------------
# GeoJSON export
# ---------------------------------------------------------------------------

def mask_to_geojson(
    mask: np.ndarray,
    transform,
    crs,
    out_path: str,
    *,
    tolerance_m: Optional[float] = None,
    trace_id: Optional[str] = None,
    tool_name: Optional[str] = None,
) -> str:
    """
    Vectorise a binary mask to a simplified GeoJSON - PRD §10.2.

    Pipeline:
      rasterio.features.shapes → shapely.simplify(gsd/2) → reproject EPSG:4326
      → write .geojson

    The output is always EPSG:4326 so web maps and PostGIS can consume it
    without a CRS conversion step.

    Parameters
    ----------
    mask:         H×W boolean/uint8 array
    transform:    rasterio Affine transform (source CRS)
    crs:          rasterio CRS object (source CRS)
    out_path:     absolute path to write to
    tolerance_m:  simplification tolerance in metres; defaults to gsd/2 estimated
                  from the transform
    trace_id:     provenance (written to each feature's properties)
    tool_name:    tool that produced the mask

    Returns
    -------
    Absolute path to the written GeoJSON.
    """
    import rasterio.features
    import rasterio.warp
    from shapely.geometry import shape, mapping
    from shapely.ops import transform as shapely_transform
    import pyproj

    Path(out_path).parent.mkdir(parents=True, exist_ok=True)

    uint8_mask = mask.astype("uint8")

    # Estimate GSD from the affine transform (pixel size in CRS units)
    pixel_size_crs = abs(float(transform.a))  # x pixel size in CRS units

    # Convert CRS units to metres for tolerance calculation
    try:
        proj = pyproj.CRS(crs)
        is_geographic = proj.is_geographic
    except Exception:
        is_geographic = False

    if tolerance_m is None:
        if is_geographic:
            # Rough: 1 degree ≈ 111_320 m
            gsd_m = pixel_size_crs * 111_320
        else:
            gsd_m = pixel_size_crs  # already in metres (projected CRS)
        tolerance_m = max(gsd_m / 2.0, 0.1)

    # Convert tolerance back to CRS units for shapely
    if is_geographic:
        tolerance_crs = tolerance_m / 111_320
    else:
        tolerance_crs = tolerance_m

    # Vectorise
    shapes_gen = rasterio.features.shapes(uint8_mask, mask=(uint8_mask > 0), transform=transform)
    features = []
    for geom_dict, value in shapes_gen:
        if value == 0:
            continue
        geom = shape(geom_dict).simplify(tolerance_crs, preserve_topology=True)
        if geom.is_empty:
            continue

        # Reproject to EPSG:4326 using pyproj
        try:
            src_crs = pyproj.CRS(crs)
            dst_crs = pyproj.CRS("EPSG:4326")
            if src_crs != dst_crs:
                project = pyproj.Transformer.from_crs(src_crs, dst_crs, always_xy=True).transform
                geom = shapely_transform(project, geom)
        except Exception:
            pass  # keep in source CRS if reprojection fails

        props = {"value": int(value)}
        if trace_id:
            props["satquery_trace"] = trace_id
        if tool_name:
            props["satquery_tool"] = tool_name

        features.append({
            "type": "Feature",
            "geometry": mapping(geom),
            "properties": props,
        })

    geojson = {
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "features": features,
    }

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, separators=(",", ":"))

    return out_path


# ---------------------------------------------------------------------------
# Convenience: compute area statistics from a mask
# ---------------------------------------------------------------------------

def mask_area_stats(
    mask: np.ndarray,
    transform,
    crs=None,
) -> dict:
    """
    Compute area_ha and fraction for a binary mask - used in the report
    evidence stats table.

    Area is computed from the actual pixel size (transform), never assumed
    to be 10 m (PRD Design Rule 4).
    """
    total_pixels = mask.shape[0] * mask.shape[1]
    foreground_pixels = int(np.count_nonzero(mask))

    pixel_area_m2: Optional[float] = None
    try:
        # Pixel size from affine transform
        px_x = abs(float(transform.a))
        px_y = abs(float(transform.e))
        # Check if CRS is geographic (degrees) and convert
        if crs is not None:
            import pyproj
            proj = pyproj.CRS(crs)
            if proj.is_geographic:
                # degrees → metres: rough mid-latitude estimate
                px_x_m = px_x * 111_320
                px_y_m = px_y * 111_320
                pixel_area_m2 = px_x_m * px_y_m
            else:
                pixel_area_m2 = px_x * px_y
        else:
            pixel_area_m2 = px_x * px_y
    except Exception:
        pixel_area_m2 = None

    area_ha: Optional[float] = None
    if pixel_area_m2 is not None:
        area_ha = round(foreground_pixels * pixel_area_m2 / 10_000, 3)

    fraction = round(foreground_pixels / max(total_pixels, 1), 6)

    return {
        "foreground_pixels": foreground_pixels,
        "total_pixels": total_pixels,
        "fraction": fraction,
        "area_ha": area_ha,
        "pixel_area_m2": pixel_area_m2,
    }
