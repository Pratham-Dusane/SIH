"""
Overlay Renderer - PRD §10.1 (Phase 7).

Converts binary numpy masks into display-ready RGBA PNGs aligned to the
scene's preview.png thumbnail.  Every visual artifact is produced in two
forms:
  - a display PNG  (RGBA, transparent background, aligned to preview.png)
  - a geo artifact (GeoTIFF or GeoJSON, handled by geo_export.py)

Layer colour palette - must match frontend evidence.* CSS tokens:
  boxes          #22d3ee
  generic mask   #a3e635
  change map     #ef4444
  water          #38bdf8
  built-up       #f59e0b
  conflict       #a855f7  (rendered with hatch pattern)
"""

from __future__ import annotations

import io
from typing import Optional, Tuple

import numpy as np
from PIL import Image

# ---------------------------------------------------------------------------
# PRD §10.1 colour palette - (R, G, B) tuples
# ---------------------------------------------------------------------------
PALETTE: dict[str, Tuple[int, int, int]] = {
    "boxes":    (34,  211, 238),   # #22d3ee - cyan
    "mask":     (163, 230, 53),    # #a3e635 - lime (generic)
    "change":   (239, 68,  68),    # #ef4444 - red
    "water":    (56,  189, 248),   # #38bdf8 - sky blue
    "built_up": (245, 158, 11),    # #f59e0b - amber
    "conflict": (168, 85,  247),   # #a855f7 - purple
}

DEFAULT_ALPHA: float = 0.55
OUTLINE_ALPHA: int = 255           # outline is fully opaque
PREVIEW_MAX_PX: int = 1024         # max edge length for the display PNG


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _hex_to_rgb(hex_colour: str) -> Tuple[int, int, int]:
    """Accept '#RRGGBB' and return (R, G, B)."""
    h = hex_colour.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _dilate_edge(mask: np.ndarray, iterations: int = 1) -> np.ndarray:
    """Return a boolean edge mask via binary dilation XOR."""
    from scipy.ndimage import binary_dilation
    dilated = binary_dilation(mask.astype(bool), iterations=iterations)
    return dilated ^ mask.astype(bool)


def _hatch_pattern(mask: np.ndarray, spacing: int = 6) -> np.ndarray:
    """
    Create a diagonal hatch visibility mask for the conflict layer.
    Returns a boolean array - True where the hatch line falls.
    """
    h, w = mask.shape
    hatch = np.zeros((h, w), dtype=bool)
    for y in range(h):
        for x in range(w):
            if mask[y, x] and ((x + y) % spacing == 0):
                hatch[y, x] = True
    return hatch


def _resize_to_preview(rgba: np.ndarray, max_px: int = PREVIEW_MAX_PX) -> np.ndarray:
    """Downscale RGBA so the longest edge is ≤ max_px (no-op if smaller)."""
    h, w = rgba.shape[:2]
    if max(h, w) <= max_px:
        return rgba
    scale = max_px / max(h, w)
    new_h, new_w = int(h * scale), int(w * scale)
    img = Image.fromarray(rgba, mode="RGBA")
    img = img.resize((new_w, new_h), Image.LANCZOS)
    return np.array(img)


def _encode_png(rgba: np.ndarray) -> bytes:
    """Encode an RGBA numpy array to PNG bytes."""
    buf = io.BytesIO()
    Image.fromarray(rgba, mode="RGBA").save(buf, format="PNG", optimize=True)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def render_mask_overlay(
    mask: np.ndarray,
    layer_type: str = "mask",
    colour: Optional[Tuple[int, int, int]] = None,
    alpha: float = DEFAULT_ALPHA,
    hatch: bool = False,
) -> bytes:
    """
    Convert a binary 2-D mask to an RGBA PNG overlay - PRD §10.1.

    Parameters
    ----------
    mask:       H×W boolean/uint8 array (non-zero = foreground)
    layer_type: key into PALETTE (boxes, mask, change, water, built_up, conflict)
    colour:     override RGB tuple; if None, uses PALETTE[layer_type]
    alpha:      fill transparency (0–1)
    hatch:      if True, render conflict-style diagonal hatch instead of fill

    Returns
    -------
    PNG bytes suitable for serving directly as image/png.
    """
    colour = colour or PALETTE.get(layer_type, PALETTE["mask"])
    h, w = mask.shape[:2]
    rgba = np.zeros((h, w, 4), dtype=np.uint8)

    bool_mask = mask.astype(bool)

    if hatch:
        # Conflict layer: diagonal hatch over the masked region
        hatch_pixels = _hatch_pattern(bool_mask)
        rgba[hatch_pixels] = (*colour, int(alpha * 255))
    else:
        # Standard semi-transparent fill
        rgba[bool_mask] = (*colour, int(alpha * 255))

    # 1-px solid outline so thin features remain visible at low alpha
    edge = _dilate_edge(bool_mask, iterations=1)
    rgba[edge] = (*colour, OUTLINE_ALPHA)

    rgba = _resize_to_preview(rgba)
    return _encode_png(rgba)


def render_boxes_overlay(
    boxes: list,
    image_hw: Tuple[int, int],
    colour: Optional[Tuple[int, int, int]] = None,
    line_width: int = 3,
) -> bytes:
    """
    Draw bounding boxes on a transparent RGBA canvas - PRD §10.1.

    Parameters
    ----------
    boxes:     list of dicts with 'bbox': [x1, y1, x2, y2] (pixel coords)
    image_hw:  (height, width) of the reference image
    colour:    RGB tuple; defaults to PALETTE['boxes']
    line_width: box outline thickness in pixels

    Returns
    -------
    PNG bytes.
    """
    colour = colour or PALETTE["boxes"]
    h, w = image_hw
    rgba = np.zeros((h, w, 4), dtype=np.uint8)

    for box in boxes:
        bbox = box.get("bbox", [])
        if len(bbox) < 4:
            continue
        x1, y1, x2, y2 = [int(v) for v in bbox[:4]]
        x1, x2 = max(0, min(x1, w - 1)), max(0, min(x2, w - 1))
        y1, y2 = max(0, min(y1, h - 1)), max(0, min(y2, h - 1))

        # Top and bottom edges
        rgba[max(0, y1 - line_width):y1 + line_width, x1:x2] = (*colour, 255)
        rgba[y2 - line_width:y2 + line_width, x1:x2] = (*colour, 255)
        # Left and right edges
        rgba[y1:y2, max(0, x1 - line_width):x1 + line_width] = (*colour, 255)
        rgba[y1:y2, x2 - line_width:x2 + line_width] = (*colour, 255)

    rgba = _resize_to_preview(rgba)
    return _encode_png(rgba)


def colour_for_layer(layer_type: str) -> str:
    """Return the hex colour string for a layer type (for JSON evidence items)."""
    rgb = PALETTE.get(layer_type, PALETTE["mask"])
    return "#{:02x}{:02x}{:02x}".format(*rgb)
