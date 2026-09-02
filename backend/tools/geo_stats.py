"""
geo_stats tool - PRD §8.3.8.

Deterministic. Converts any binary mask to area / percentage / counts,
using GSD from scene metadata.  Refuses to report absolute area (m², ha, km²)
on non-georeferenced (benchmark) scenes and returns percentage only with a warning.
Fully offline-capable.
"""

from __future__ import annotations

from typing import Literal

import numpy as np

from tools.base import Tool, ToolParams, ToolResult
from tools.registry import register


def mask_area(
    mask: np.ndarray,
    gsd_x_m: float,
    gsd_y_m: float,
    units: str = "ha",
) -> float:
    """Convert a boolean mask to area in the requested units."""
    m2 = float(mask.sum()) * gsd_x_m * gsd_y_m
    return {
        "m2": m2,
        "ha": m2 / 10_000,
        "km2": m2 / 1_000_000,
        "percent": 100.0 * float(mask.mean()),
    }[units]


class GeoStatsParams(ToolParams):
    mask_ref: str                                      # artifact key from a prior step
    units: Literal["m2", "ha", "km2", "percent"] = "ha"


@register
class GeoStatsTool(Tool):
    name = "geo_stats"
    description = (
        "Convert any binary mask (from a prior tool step) into calibrated area statistics. "
        "Reports area in m², hectares, km², or percentage.  "
        "Refuses to report absolute area for non-georeferenced (benchmark) images.  "
        "Deterministic, offline-capable, exact."
    )
    accepts: list = ["SINGLE", "CROSS_MODAL", "BI_TEMPORAL"]
    required_modalities: list = []
    params_model = GeoStatsParams
    produces: list = ["stats"]
    model_id = None
    offline_capable = True

    async def run(self, ctx, params: GeoStatsParams) -> ToolResult:
        # Resolve the mask from user annotations or a prior step's artifacts
        mask = None
        is_user_ann = (
            params.mask_ref in ("user_annotation", "user_annotations", "user_annotation_mask", "annotation", "layer")
            or "annotation" in params.mask_ref
            or "layer" in params.mask_ref
        )

        if is_user_ann and hasattr(ctx, "get_user_annotation_mask"):
            mask = ctx.get_user_annotation_mask()

        if mask is None:
            mask = ctx.get_artifact(params.mask_ref)

        if mask is None and hasattr(ctx, "get_user_annotation_mask") and getattr(ctx, "user_annotations", None):
            # Fallback to user annotation mask if artifact key didn't match prior step
            mask = ctx.get_user_annotation_mask()

        if mask is None:
            return ToolResult(
                tool=self.name, confidence=0.0,
                confidence_basis="referenced mask not found",
                warnings=[f"Artifact '{params.mask_ref}' not found in prior step outputs or annotations"],
            )

        if isinstance(mask, list):
            # Rasterize normalized bounding boxes to a boolean mask
            grid = np.zeros((512, 512), dtype=bool)
            for box in mask:
                if isinstance(box, (list, tuple)) and len(box) == 4:
                    c1, c2, c3, c4 = (float(v) for v in box)
                    ymin = min(c1, c2)
                    ymax = max(c2, c4)
                    xmin = min(c1, c3) if c1 > c2 else min(c2, c4)
                    xmax = max(c1, c3) if c1 > c2 else max(c2, c4)
                    r1 = max(0, min(512, int(ymin * 512)))
                    r2 = max(0, min(512, int(ymax * 512)))
                    c1_px = max(0, min(512, int(xmin * 512)))
                    c2_px = max(0, min(512, int(xmax * 512)))
                    grid[r1:r2, c1_px:c2_px] = True
            mask = grid

        if not isinstance(mask, np.ndarray):
            return ToolResult(
                tool=self.name, confidence=0.0,
                confidence_basis="referenced artifact is not a mask array",
                warnings=[f"Artifact '{params.mask_ref}' is not a numpy array"],
            )

        # Check georeferencing
        georeferenced = ctx.scene_georeferenced()
        gsd_x = ctx.scene_gsd_x_m()
        gsd_y = ctx.scene_gsd_y_m()
        warnings = []

        # A mask produced on a different grid than the uploaded raster (e.g. a
        # GEE change mask at 10 m) carries its own GSD.  Measuring it with the
        # scene's GSD would silently report the wrong area, so prefer its own.
        own_gsd = (ctx.artifact_gsd(params.mask_ref)
                   if hasattr(ctx, "artifact_gsd") else None)
        gsd_source = "scene metadata"
        if own_gsd is not None:
            gsd_x = gsd_y = own_gsd
            georeferenced = True
            gsd_source = f"the mask's own grid ({own_gsd:g} m)"
            warnings.append(
                f"Area computed on {gsd_source}, not the uploaded raster's grid - "
                "this mask was produced by a different pipeline."
            )

        if not georeferenced or gsd_x is None or gsd_y is None:
            # PRD: geo_stats refuses on non-georeferenced scenes and returns
            # percentage only, with a warning. Never report hectares for a benchmark PNG.
            if params.units != "percent":
                warnings.append(
                    f"Scene is not georeferenced - cannot compute {params.units}. "
                    "Returning percentage instead."
                )
            units_used = "percent"
            area_val = 100.0 * float(mask.astype(bool).mean())
            area_m2 = None
        else:
            units_used = params.units
            area_val = mask_area(mask.astype(bool), gsd_x, gsd_y, units_used)
            area_m2 = mask_area(mask.astype(bool), gsd_x, gsd_y, "m2")

        total_pixels = int(mask.size)
        positive_pixels = int(mask.astype(bool).sum())
        percent = 100.0 * positive_pixels / max(total_pixels, 1)

        unit_labels = {"m2": "m²", "ha": "ha", "km2": "km²", "percent": "%"}
        unit_label = unit_labels.get(units_used, units_used)

        text = f"Mask covers {positive_pixels:,} of {total_pixels:,} pixels ({percent:.1f}%)."
        if units_used != "percent" and area_val is not None:
            text += f"  Area: {area_val:,.1f} {unit_label}."

        facts = {
            "total_pixels": total_pixels,
            "positive_pixels": positive_pixels,
            "percent": round(percent, 2),
            f"area_{units_used}": round(area_val, 2) if area_val is not None else None,
        }
        if area_m2 is not None:
            facts["area_m2"] = round(area_m2, 2)
        facts["gsd_source"] = gsd_source

        return ToolResult(
            tool=self.name,
            text=text,
            facts=facts,
            confidence=1.0,
            confidence_basis=(
                "deterministic pixel count and GSD-based area - exact computation "
                f"(GSD from {gsd_source})"
            ),
            warnings=warnings,
        )
