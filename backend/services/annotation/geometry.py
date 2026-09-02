"""
Annotation geometry & coordinate transformation service — Extensions PRD §5.3, §5.4.

Coordinates contract:
1. Canonical form: Normalised image coordinates [0, 1] relative to raster (0,0 is top-left).
2. Rasterization: Render shapes to a binary boolean mask np.ndarray for mask_ref / tool operations.
3. GeoJSON export: Transform normalized coordinates to EPSG:4326 using scene bounds.
4. Symbolic description: Generate concise spatial summaries (quadrant, area_ha, centroid) for VLM/LLM context.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

log = logging.getLogger(__name__)


def norm_to_pixel(point: List[float], width: int, height: int) -> Tuple[int, int]:
    """Convert normalized [0, 1] to pixel (x, y)."""
    nx, ny = point[0], point[1]
    px = int(round(nx * (width - 1)))
    py = int(round(ny * (height - 1)))
    return max(0, min(width - 1, px)), max(0, min(height - 1, py))


def norm_to_geo(point: List[float], bounds_wgs84: List[float]) -> Tuple[float, float]:
    """Convert normalized [0, 1] to (lon, lat) WGS84."""
    w, s, e, n = bounds_wgs84
    nx, ny = point[0], point[1]
    lon = w + nx * (e - w)
    lat = n - ny * (n - s)  # Y is inverted (0 is north/top)
    return round(lon, 6), round(lat, 6)


def get_quadrant(norm_x: float, norm_y: float) -> str:
    """Return human-readable quadrant description."""
    vert = "north" if norm_y < 0.5 else "south"
    horiz = "west" if norm_x < 0.5 else "east"
    if 0.35 <= norm_x <= 0.65 and 0.35 <= norm_y <= 0.65:
        return "center"
    return f"{vert}-{horiz}"


def shapes_to_mask(
    shapes: List[Dict[str, Any]], width: int, height: int
) -> np.ndarray:
    """
    Rasterize vector shapes into a binary uint8 mask [0, 255].
    Used by annotation-aware tool operations and mask_ref.
    """
    try:
        from PIL import Image, ImageDraw
        img = Image.new("L", (width, height), 0)
        draw = ImageDraw.Draw(img)

        for shape in shapes:
            kind = shape.get("kind", "freehand")
            points = shape.get("points", [])
            if not points:
                continue

            pixel_pts = [norm_to_pixel(p, width, height) for p in points]

            if kind in ("freehand", "polygon", "rectangle"):
                if len(pixel_pts) >= 3:
                    draw.polygon(pixel_pts, fill=255)
                elif len(pixel_pts) == 2:
                    x1, y1 = pixel_pts[0]
                    x2, y2 = pixel_pts[1]
                    draw.rectangle([min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2)], fill=255)
            elif kind in ("circle", "ellipse"):
                if len(pixel_pts) >= 2:
                    cx, cy = pixel_pts[0]
                    rx_pt = pixel_pts[1]
                    rx = abs(rx_pt[0] - cx)
                    ry = rx if kind == "circle" else abs(rx_pt[1] - cy)
                    draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255)
            elif kind == "point":
                px, py = pixel_pts[0]
                r = max(3, int(width * 0.01))
                draw.ellipse([px - r, py - r, px + r, py + r], fill=255)

        return np.array(img, dtype=np.uint8)
    except Exception as e:
        log.warning("Mask rasterization failed: %s", e)
        return np.zeros((height, width), dtype=np.uint8)


def describe_layer_for_prompt(
    layer: Dict[str, Any],
    bounds_wgs84: Optional[List[float]] = None,
    gsd_m: Optional[float] = None,
) -> str:
    """
    Build symbolic natural-language context describing the layer's shapes for the agent planner.
    Extensions PRD §5.4.
    """
    shapes = layer.get("shapes", [])
    if not shapes:
        return f"Layer '{layer.get('name')}' contains 0 annotations."

    lines = [
        f"User-drawn Annotation Layer: '{layer.get('name', 'Annotations')}' "
        f"({len(shapes)} shapes, colour: {layer.get('colour', '#ef4444')}):"
    ]

    for idx, shape in enumerate(shapes):
        badge = idx + 1
        kind = shape.get("kind", "shape")
        points = shape.get("points", [])
        if not points:
            continue

        xs = [p[0] for p in points]
        ys = [p[1] for p in points]
        cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
        quad = get_quadrant(cx, cy)
        bbox = [round(min(xs), 3), round(min(ys), 3), round(max(xs), 3), round(max(ys), 3)]

        desc = f"- Region [{badge}] ({kind}): located in {quad} quadrant (center ~{cx:.2f}, {cy:.2f}, bbox {bbox})"

        if shape.get("text") or shape.get("label"):
            desc += f", label='{shape.get('text') or shape.get('label')}'"

        if bounds_wgs84 and len(bounds_wgs84) == 4:
            geo_lon, geo_lat = norm_to_geo([cx, cy], bounds_wgs84)
            desc += f", approx coord ({geo_lat:.4f}°N, {geo_lon:.4f}°E)"

        lines.append(desc)

    return "\n".join(lines)
