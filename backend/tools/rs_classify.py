"""
rs_classify tool — PRD §7.3.  Land cover via Google Earth Engine (backend G1).

This queries GEE's catalog for the **scene's AOI**, not the uploaded pixels.
It therefore does not violate Design Rule 2 (perception from RS-adapted models
only) — it violates Design Rule 3 (offline-capable) and nothing else (§7.0).

Dynamic World first; falls back to ESA WorldCover when Dynamic World has no
coverage for the date range.
"""

from __future__ import annotations

import asyncio

from pydantic import Field

from core.gee import (
    GEEUnavailable, gee_available, land_cover, render_landcover_summary,
)
from tools._backends import error_result, unavailable_result
from tools.base import Tool, ToolParams, ToolResult
from tools.registry import register

BACKEND_LABEL = "Google Earth Engine (backend G1)"


class RSClassifyParams(ToolParams):
    scale_m: int = Field(10, ge=10, le=100)


@register
class LandCoverTool(Tool):
    name = "rs_classify"
    description = (
        "Land-cover class fractions (water, trees, crops, built, bare, …) for the "
        "scene's AOI, from Google Earth Engine's Dynamic World product, falling "
        "back to ESA WorldCover. This is a global reference classification for "
        "the same footprint and date range — NOT a classification of the uploaded "
        "raster, so never present its numbers as a measurement of the user's "
        "image. Needs a georeferenced scene with a known acquisition date, and "
        "network access."
    )
    accepts: list = ["SINGLE", "CROSS_MODAL"]
    required_modalities: list = []
    params_model = RSClassifyParams
    produces: list = ["stats"]
    model_id = "G1"
    offline_capable = False

    async def run(self, ctx, p: RSClassifyParams) -> ToolResult:
        ok, reason = gee_available()
        if not ok:
            return unavailable_result(self.name, self.model_id, reason, BACKEND_LABEL)

        bounds = ctx.scene_bounds_wgs84()
        if not bounds:
            return ToolResult(
                tool=self.name, model_id=self.model_id, confidence=0.0,
                confidence_basis="scene has no WGS84 footprint — no AOI to query",
                text=("Land cover cannot be looked up: this scene is not georeferenced, "
                      "so there is no area of interest to query Earth Engine with."),
                facts={"status": "NO_AOI"},
                warnings=["rs_classify requires a georeferenced scene (bounds_wgs84)"],
            )

        start, end = ctx.scene_acquisition_window()
        if not start or not end:
            return ToolResult(
                tool=self.name, model_id=self.model_id, confidence=0.0,
                confidence_basis="scene has no acquisition date — no date range to query",
                text=("Land cover cannot be looked up: no acquisition date is recorded "
                      "for this scene, so the Earth Engine query has no date range. "
                      "Set the acquisition date on the scene and retry."),
                facts={"status": "NO_DATE_RANGE"},
                warnings=["rs_classify requires an acquisition date on the scene"],
            )

        try:
            # The Earth Engine client is synchronous; run it off the event loop
            # so a slow catalog query does not stall the SSE stream.
            out = await asyncio.to_thread(land_cover, bounds, start, end, p.scale_m)
        except GEEUnavailable as e:
            return unavailable_result(self.name, self.model_id, str(e), BACKEND_LABEL)
        except Exception as e:  # noqa: BLE001
            return error_result(self.name, self.model_id, e, BACKEND_LABEL)

        fractions = out["class_fractions"]
        if not fractions:
            return ToolResult(
                tool=self.name, model_id=self.model_id, confidence=0.0,
                confidence_basis="no land-cover coverage for this AOI and date range",
                text=("Neither Dynamic World nor ESA WorldCover returned land-cover "
                      f"pixels for this AOI between {start} and {end}."),
                facts={"status": "NO_COVERAGE", "aoi_wgs84": bounds,
                       "date_range": [start, end]},
                warnings=[out.get("fallback_reason", "no coverage")],
            )

        warnings = []
        if out.get("fallback"):
            warnings.append(
                f"Dynamic World unavailable for this window — fell back to "
                f"{out['product_label']} ({out.get('fallback_reason', '')})".strip()
            )

        return ToolResult(
            tool=self.name,
            model_id="G1",
            model_version=out["product"],
            text=render_landcover_summary(fractions, out["product_label"]),
            facts={
                "class_fractions": fractions,
                "dominant_class": next(iter(fractions)),
                "product": out["product"],
                "aoi_wgs84": bounds,
                "date_range": [start, end],
                "scale_m": out["scale_m"],
                "image_count": out["image_count"],
                "fallback": bool(out.get("fallback")),
            },
            confidence=0.7,
            confidence_basis=(
                f"{out['product_label']} global product, not scene-specific — treat as "
                "a reference classification, not a measurement of the exact uploaded raster"
            ),
            warnings=warnings,
        )
