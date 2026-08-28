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
        # Resolve the mask from a prior step's artifacts
        mask = ctx.get_artifact(params.mask_ref)
        if mask is None:
            return ToolResult(
                tool=self.name, confidence=0.0,
                confidence_basis="referenced mask not found",
                warnings=[f"Artifact '{params.mask_ref}' not found in prior step outputs"],
            )

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
