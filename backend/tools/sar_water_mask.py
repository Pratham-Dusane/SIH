"""
sar_water_mask tool - PRD §8.3.8, with the optional GEE path from §7.5.

Deterministic. Otsu backscatter thresholding on SAR dB imagery to produce a
binary water mask.  Fully offline-capable.

§7.5 allows an optional Sentinel-1 GRD path: where the AOI/date range is
covered by GEE's catalog, already-processed backscatter can be used directly,
skipping the local dB conversion.  **That is optional acceleration, not a
replacement.**  `source` defaults to `local`; the deterministic local dB
pipeline stays the primary and only offline path and is mandatory whenever the
scene is a user-uploaded RISAT / other non-catalog raster GEE does not host.
Any failure on the GEE path falls back to local rather than failing the step.
"""

from __future__ import annotations

from typing import Literal, Optional

import numpy as np
from pydantic import Field

from tools.base import Tool, ToolParams, ToolResult
from tools.registry import register


def _otsu_threshold(data: np.ndarray) -> float:
    """Simple Otsu threshold on a flat array of finite values."""
    finite = data[np.isfinite(data)]
    if finite.size == 0:
        return 0.0
    hist, bin_edges = np.histogram(finite, bins=256)
    bin_centres = (bin_edges[:-1] + bin_edges[1:]) / 2.0
    total = hist.sum()
    if total == 0:
        return float(bin_centres[128])

    w0 = np.cumsum(hist).astype("float64")
    w1 = total - w0
    sum0 = np.cumsum(hist * bin_centres)
    sum_total = sum0[-1]

    with np.errstate(divide="ignore", invalid="ignore"):
        mu0 = np.where(w0 == 0, 0, sum0 / w0)
        mu1 = np.where(w1 == 0, 0, (sum_total - sum0) / w1)
    between = w0 * w1 * (mu0 - mu1) ** 2
    idx = int(np.argmax(between))
    return float(bin_centres[idx])


def _gee_sar_db(ctx, polarisation: str) -> tuple:
    """
    §7.5 optional acceleration: pull an already-processed Sentinel-1 GRD dB
    raster for the scene AOI.  Returns (db_array, provenance_dict) or
    (None, reason_string) - never raises, so the caller always falls back to
    the mandatory local pipeline.
    """
    from core.config import settings

    if settings.OFFLINE_MODE:
        return None, "OFFLINE_MODE=true - the GEE path is not offline-capable (PRD §11.5)"

    from core.gee import gee_available, sentinel1_grd

    ok, reason = gee_available()
    if not ok:
        return None, reason

    bounds = ctx.scene_bounds_wgs84()
    if not bounds:
        return None, "scene is not georeferenced - no AOI to query Earth Engine with"
    start, end = ctx.scene_acquisition_window()
    if not start or not end:
        return None, "scene has no acquisition date - no date range to query"

    try:
        out = sentinel1_grd(bounds, start, end, polarisation=polarisation,
                            export_path=ctx.artifact_path("s1_grd_db.tif"))
    except Exception as e:  # noqa: BLE001 - optional path, must fail soft
        return None, f"{type(e).__name__}: {e}"

    if not out.get("available") or not out.get("tif_path"):
        return None, out.get("reason", "no Sentinel-1 GRD coverage for this AOI/date range")

    try:
        import rasterio
        with rasterio.open(out["tif_path"]) as src:
            db = src.read(1).astype("float64")
    except Exception as e:  # noqa: BLE001
        return None, f"could not read the exported Sentinel-1 raster: {e}"

    return db, {
        "source": out["source"],
        "polarisation": out["polarisation"],
        "image_count": out["image_count"],
        "scale_m": out["scale_m"],
        "date_range": out["date_range"],
        "tif_path": out["tif_path"],
    }


class SARWaterMaskParams(ToolParams):
    threshold_db: float | None = Field(None, ge=-30.0, le=5.0)  # None -> Otsu
    band_index: int = Field(0, ge=0, le=3)  # which SAR band (0 = VV or first)
    # §7.5 - 'local' is the deterministic, offline-capable, mandatory default.
    source: Literal["local", "gee"] = "local"
    polarisation: Literal["VV", "VH"] = "VV"   # only used when source='gee'


@register
class SARWaterMaskTool(Tool):
    name = "sar_water_mask"
    description = (
        "Produce a binary water mask from SAR imagery using Otsu thresholding "
        "on the backscatter intensity (dB scale).  Water appears dark in SAR "
        "(low backscatter).  Deterministic, offline-capable, exact.  "
        "Set source='gee' only to accelerate with already-processed Sentinel-1 "
        "GRD backscatter for an in-catalog AOI; the default source='local' runs "
        "on the uploaded raster and is the only path that works offline or on "
        "non-catalog sensors such as RISAT."
    )
    accepts: list = ["SINGLE", "CROSS_MODAL", "BI_TEMPORAL"]
    required_modalities: list = ["SAR"]
    params_model = SARWaterMaskParams
    produces: list = ["mask", "stats"]
    model_id = None
    offline_capable = True

    async def run(self, ctx, params: SARWaterMaskParams) -> ToolResult:
        warnings: list = []
        db: Optional[np.ndarray] = None
        provenance = {"source": "local", "pipeline": "local dB conversion (PRD §6.5)"}

        # --- §7.5 optional acceleration: GEE Sentinel-1 GRD ----------------
        if params.source == "gee":
            # Earth Engine's client is synchronous - keep it off the event loop.
            import asyncio
            gee_db, info = await asyncio.to_thread(_gee_sar_db, ctx, params.polarisation)
            if gee_db is None:
                warnings.append(
                    f"GEE Sentinel-1 path unavailable ({info}) - fell back to the "
                    "deterministic local dB pipeline"
                )
            else:
                db = np.clip(gee_db, -30.0, 10.0)
                # `info` carries a `source` of its own (the catalog id) - keep it
                # under `catalog` so it cannot clobber the local/gee provenance flag.
                provenance = {**info, "catalog": info.get("source"),
                              "source": "gee",
                              "pipeline": "GEE Sentinel-1 GRD (dB)"}
                warnings.append(
                    "Backscatter came from GEE's Sentinel-1 GRD catalog for this AOI, "
                    "not from the uploaded raster - this path is online-only and is not "
                    "a measurement of the uploaded image."
                )

        # --- primary, mandatory, offline-capable local path ----------------
        if db is None:
            arr = ctx.get_sar_array()
            if arr is None:
                return ToolResult(
                    tool=self.name, confidence=0.0,
                    confidence_basis="no SAR image available",
                    warnings=warnings + ["No SAR image found in this scene"],
                )

            # Select band
            if params.band_index >= arr.shape[0]:
                return ToolResult(
                    tool=self.name, confidence=0.0,
                    confidence_basis="invalid band index",
                    warnings=warnings + [
                        f"Requested band {params.band_index} but SAR has {arr.shape[0]} band(s)"
                    ],
                )

            band = arr[params.band_index].astype("float64")

            # Convert to dB (amplitude/intensity -> dB)
            db = 10.0 * np.log10(np.clip(band, 1e-10, None))
            db = np.clip(db, -30.0, 10.0)

        # Determine threshold
        if params.threshold_db is not None:
            thresh = params.threshold_db
            thresh_method = f"user-specified ({thresh:.1f} dB)"
        else:
            thresh = _otsu_threshold(db)
            thresh_method = f"Otsu auto-threshold ({thresh:.2f} dB)"

        # Water = pixels below threshold (low backscatter)
        water_mask = db < thresh

        # Statistics
        water_fraction = float(water_mask.sum()) / max(water_mask.size, 1)

        # Store artifact
        ctx.store_artifact("water_mask", water_mask)
        ctx.store_artifact("sar_db", db)

        text = (
            f"SAR water mask computed via {thresh_method}.  "
            f"{water_fraction * 100:.1f}% of the scene classified as water "
            f"(pixels below {thresh:.2f} dB)."
        )
        if provenance["source"] == "gee":
            text += ("  Backscatter source: GEE Sentinel-1 GRD catalog for the scene AOI, "
                     "not the uploaded raster.")

        basis = "deterministic Otsu threshold on SAR dB backscatter - exact computation"
        if provenance["source"] == "gee":
            basis += "; backscatter from the GEE Sentinel-1 GRD catalog (online-only path)"

        return ToolResult(
            tool=self.name,
            model_version=provenance.get("catalog") or provenance.get("source"),
            text=text,
            facts={
                "water_fraction": round(water_fraction, 4),
                "threshold_db": round(thresh, 2),
                "threshold_method": thresh_method,
                "total_pixels": int(water_mask.size),
                "water_pixels": int(water_mask.sum()),
                "backscatter_provenance": provenance,
            },
            artifacts={"mask": "water_mask", "sar_db": "sar_db"},
            confidence=1.0,
            confidence_basis=basis,
            warnings=warnings,
        )
