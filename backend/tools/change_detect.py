"""
change_detect tool — PRD §7.4, §8.3.4.  Change map + area (R5), backend G2.

NDVI/NDBI time-series differencing over the AOI/date range using Google Earth
Engine Sentinel-2 composites.  Like `rs_classify` this takes AOI bounds and
dates only — never the uploaded pixel array (§7.0).

**Honest expectation, stated in the tool description the planner reads:** this
will not match a trained Siamese U-Net's IoU on a labeled benchmark (§11.2),
but is defensible on real, unlabeled queries.

When the input is bi-temporal but **not** co-registered within tolerance this
tool refuses rather than producing a garbage mask: registration error is
indistinguishable from real change.
"""

from __future__ import annotations

import asyncio

from pydantic import Field

from core.gee import GEEUnavailable, change_ndvi_ndbi, gee_available
from tools._backends import error_result, unavailable_result
from tools.base import Tool, ToolParams, ToolResult
from tools.registry import register

BACKEND_LABEL = "Google Earth Engine (backend G2)"

# Above this pixel shift, misregistration and real change are indistinguishable.
# Matches the FAIL band of coreg_check (§8.3.8) and the input gate (§9.3).
COREG_TOLERANCE_PX = 8.0

DIRECTION_TEXT = {
    "built_up_increase": "built-up area increased (NDBI up, NDVI down)",
    "vegetation_increase": "vegetation increased",
    "vegetation_decrease": "vegetation decreased",
    "unchanged": "no significant change",
    "unknown": "direction could not be determined",
}


class ChangeDetectParams(ToolParams):
    threshold: float = Field(0.5, ge=0.05, le=0.95)
    scale_m: int = Field(10, ge=10, le=100)
    composite_window_days: int = Field(30, ge=5, le=180)


@register
class ChangeDetectTool(Tool):
    name = "change_detect"
    description = (
        "Produce a binary change map plus changed-area statistics for a "
        "bi-temporal pair, by differencing NDVI and NDBI between two Google "
        "Earth Engine Sentinel-2 composites over the scene AOI. This is a "
        "thresholded index difference, NOT a trained change detector — expect "
        "lower IoU than a labeled-benchmark model, and say so when reporting it. "
        "Refuses outright when the pair is misregistered beyond ~8 px, because "
        "registration error is indistinguishable from real change. Needs a "
        "georeferenced scene with both acquisition dates, and network access."
    )
    accepts: list = ["BI_TEMPORAL"]
    required_modalities: list = []
    params_model = ChangeDetectParams
    produces: list = ["mask", "map", "stats"]
    model_id = "G2"
    offline_capable = False

    async def run(self, ctx, p: ChangeDetectParams) -> ToolResult:
        # --- refuse on misregistration before touching the network ---------
        shift = getattr(ctx.scene, "coreg_shift_px", None)
        if shift is not None and float(shift) > COREG_TOLERANCE_PX:
            return ToolResult(
                tool=self.name, model_id=self.model_id, confidence=0.0,
                confidence_basis=(
                    f"refused: {float(shift):.1f} px misregistration exceeds the "
                    f"{COREG_TOLERANCE_PX:.0f} px tolerance"
                ),
                text=(
                    f"Change detection refused: the pair is misregistered by "
                    f"{float(shift):.1f} px. At that offset registration error is "
                    "indistinguishable from real change, so any mask produced here "
                    "would be meaningless. Co-register the pair to within ~2 px and retry."
                ),
                facts={"status": "REFUSED_MISREGISTERED",
                       "coreg_shift_px": float(shift),
                       "tolerance_px": COREG_TOLERANCE_PX},
                warnings=[f"misregistration of {float(shift):.1f} px — change_detect refused"],
            )

        ok, reason = gee_available()
        if not ok:
            return unavailable_result(self.name, self.model_id, reason, BACKEND_LABEL)

        bounds = ctx.scene_bounds_wgs84()
        if not bounds:
            return ToolResult(
                tool=self.name, model_id=self.model_id, confidence=0.0,
                confidence_basis="scene has no WGS84 footprint — no AOI to query",
                text=("Change detection cannot run: this scene is not georeferenced, "
                      "so there is no area of interest to query Earth Engine with."),
                facts={"status": "NO_AOI"},
                warnings=["change_detect requires a georeferenced scene (bounds_wgs84)"],
            )

        t1_date, t2_date = ctx.scene_t1_t2_dates()
        if not t1_date or not t2_date:
            return ToolResult(
                tool=self.name, model_id=self.model_id, confidence=0.0,
                confidence_basis="scene is missing one or both acquisition dates",
                text=("Change detection cannot run: Earth Engine needs both acquisition "
                      f"dates and this scene has t1={t1_date or 'unknown'}, "
                      f"t2={t2_date or 'unknown'}. Set the acquisition dates on the "
                      "scene images and retry."),
                facts={"status": "NO_DATES", "t1_date": t1_date, "t2_date": t2_date},
                warnings=["change_detect requires t1 and t2 acquisition dates"],
            )

        export_path = ctx.artifact_path("change_mask.tif")
        try:
            # The Earth Engine client and the GeoTIFF download are both
            # synchronous; run them off the event loop so the SSE stream keeps
            # flowing while the composite is built.
            out = await asyncio.to_thread(
                change_ndvi_ndbi,
                bounds, t1_date, t2_date,
                p.threshold, p.scale_m, p.composite_window_days, export_path,
            )
        except GEEUnavailable as e:
            return unavailable_result(self.name, self.model_id, str(e), BACKEND_LABEL)
        except Exception as e:  # noqa: BLE001
            return error_result(self.name, self.model_id, e, BACKEND_LABEL)

        changed = out["changed_fraction"]
        if changed is None:
            return ToolResult(
                tool=self.name, model_id=self.model_id, confidence=0.0,
                confidence_basis="no usable Sentinel-2 composite for one or both dates",
                text=("Change detection produced no statistics: Earth Engine had no "
                      f"cloud-free Sentinel-2 coverage for this AOI near {t1_date} "
                      f"and/or {t2_date}."),
                facts={"status": "NO_COVERAGE", "t1_date": t1_date, "t2_date": t2_date,
                       "aoi_wgs84": bounds},
                warnings=["no Sentinel-2 composite available for one or both dates"],
            )

        warnings = []
        if shift is not None and float(shift) > 2.0:
            warnings.append(
                f"pair is co-registered to {float(shift):.1f} px — within tolerance but "
                "not exact; small changes near that scale are not trustworthy"
            )
        # Land the exported mask in the artifact store so the prescribed
        # geo_stats step (§9.4) and the evidence layer both have something real
        # to work with.  It is on GEE's grid, not the uploaded raster's, so its
        # own GSD travels with it — geo_stats reads that instead of the scene's.
        artifacts = {}
        if out.get("mask_path"):
            try:
                import numpy as np
                import rasterio
                with rasterio.open(out["mask_path"]) as src:
                    mask_arr = src.read(1).astype(bool)
                ctx.store_artifact("change_mask", mask_arr, gsd_m=float(out["scale_m"]))
                artifacts["mask"] = "change_mask"
            except Exception as e:  # noqa: BLE001 — the statistics still stand
                warnings.append(
                    f"exported change mask could not be read back ({type(e).__name__}: {e}) "
                    "— statistics only, no measurable mask artifact"
                )
            artifacts["map"] = out["mask_path"]
            artifacts["geotiff"] = out["mask_path"]
        else:
            warnings.append("change mask GeoTIFF export failed — statistics only, no map layer")

        area_clause = ""
        if out.get("changed_area_ha") is not None:
            area_clause = f" ({out['changed_area_ha']:,.1f} ha)"

        text = (
            f"NDVI/NDBI differencing between {t1_date} and {t2_date} "
            f"(Sentinel-2 median composites, ±{out['composite_window_days']} days, "
            f"{out['scale_m']} m, threshold {out['threshold']:.2f}): "
            f"{changed * 100:.2f}% of the AOI changed{area_clause}. "
            f"Mean NDVI change {out['ndvi_delta_mean']:+.4f}, "
            f"mean NDBI change {out['ndbi_delta_mean']:+.4f} — "
            f"{DIRECTION_TEXT.get(out['direction'], out['direction'])}. "
            "This is a thresholded index difference, not a trained detector."
        )

        facts = dict(out)
        facts.pop("mask_path", None)
        facts["aoi_wgs84"] = bounds
        facts["coreg_shift_px"] = None if shift is None else float(shift)

        return ToolResult(
            tool=self.name,
            model_id="G2",
            model_version=out["source"],
            text=text,
            facts=facts,
            artifacts=artifacts,
            confidence=0.6,
            confidence_basis=(
                "NDVI/NDBI differencing threshold, not a trained detector — expect "
                "lower IoU than a labeled-benchmark model"
            ),
            warnings=warnings,
        )
