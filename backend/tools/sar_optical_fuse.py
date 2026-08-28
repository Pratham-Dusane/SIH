"""
Cross-modal optical+SAR fusion -- PRD Section 8.3.7 (R6).

Deterministic inter-sensor agreement: NDWI/NDBI from optical bands,
Otsu-thresholded SAR backscatter.  No learned fusion head -- agreement
fraction IS the confidence signal.

Offline-capable when using uploaded rasters (no GEE path needed).
"""

from __future__ import annotations

import logging
from typing import Literal, Optional

import numpy as np
from pydantic import Field

from tools.base import Tool, ToolParams, ToolResult
from tools.registry import register
from core.sar import is_degenerate, to_db, uncalibrated_warning

log = logging.getLogger(__name__)


class FuseParams(ToolParams):
    targets: list = Field(default=["all"])
    agreement_only: bool = False


def _normalized_difference(arr: np.ndarray, b1: int, b2: int) -> np.ndarray:
    """Compute (b1 - b2) / (b1 + b2) with safe division."""
    a = arr[b1].astype("float64")
    b = arr[b2].astype("float64")
    denom = a + b
    denom[denom == 0] = 1e-10
    return (a - b) / denom


# dB conversion lives in tools/_sar_db.py: a fixed calibrated clip range
# flattens uncalibrated DN products to a constant and silently zeroes every
# SAR mask.  See that module for the full explanation.


def _otsu_threshold(data: np.ndarray) -> float:
    """Simple Otsu threshold on a 1D array of finite values."""
    vals = data[np.isfinite(data)].ravel()
    if len(vals) == 0:
        return 0.0
    hist, bin_edges = np.histogram(vals, bins=256)
    bin_centers = (bin_edges[:-1] + bin_edges[1:]) / 2
    total = hist.sum()
    if total == 0:
        return float(np.median(vals))

    w0 = np.cumsum(hist).astype("float64")
    w1 = total - w0
    m0 = np.cumsum(hist * bin_centers)
    m0 = np.where(w0 > 0, m0 / w0, 0)
    m1_num = np.cumsum((hist * bin_centers)[::-1])[::-1]
    m1 = np.where(w1 > 0, m1_num / w1, 0)

    variance = w0 * w1 * (m0 - m1) ** 2
    idx = int(np.argmax(variance))
    return float(bin_centers[idx])


def _agreement_confidence(agree: np.ndarray, a: np.ndarray, b: np.ndarray) -> float:
    """Confidence based on fraction of agreement between two binary masks."""
    union = a | b
    union_count = float(union.sum())
    if union_count == 0:
        return 0.5  # no signal either way
    return float(agree.sum()) / union_count


@register
class SAROpticalFuseTool(Tool):
    name = "sar_optical_fuse"
    description = (
        "Joint optical+SAR extraction via inter-sensor agreement. "
        "Computes NDWI/NDBI from optical bands and Otsu-thresholds SAR "
        "backscatter, then reports where the two sensors agree and disagree "
        "on water, built-up, and vegetation. No learned fusion head -- "
        "fully deterministic."
    )
    accepts: list = ["CROSS_MODAL"]
    required_modalities: list = ["SAR", "OPTICAL|MULTISPECTRAL"]
    params_model = FuseParams
    produces: list = ["stats", "mask", "text"]
    model_id = None
    offline_capable = True

    async def run(self, ctx, p: FuseParams) -> ToolResult:
        # Load arrays
        opt_arr = ctx.get_optical_array()
        sar_arr = ctx.get_sar_array()

        if opt_arr is None or sar_arr is None:
            return ToolResult(
                tool=self.name, confidence=0.0,
                confidence_basis="missing optical or SAR array",
                text="Cross-modal fusion requires both optical and SAR images to be loaded.",
                warnings=["Could not load one or both image arrays."],
            )

        # Ensure at least 3 bands in optical for index computation
        if opt_arr.shape[0] < 3:
            return ToolResult(
                tool=self.name, confidence=0.0,
                confidence_basis="insufficient optical bands",
                text="Optical image needs at least 3 bands for spectral indices.",
                warnings=[f"Optical has {opt_arr.shape[0]} band(s), need 3+."],
            )

        # SAR: convert to dB, flatten to single band if multi-pol
        if sar_arr.ndim == 3:
            sar_band = sar_arr[0]  # VV or first polarisation
        else:
            sar_band = sar_arr
        sar_db, sar_calibrated = to_db(sar_band)
        if is_degenerate(sar_db):
            return ToolResult(
                tool=self.name, confidence=0.0,
                confidence_basis="SAR raster has no usable contrast",
                text=("Cross-modal fusion cannot run: the SAR image carries no "
                      "variation to threshold on."),
                warnings=["SAR raster is single-valued after dB conversion."],
            )

        # Resize to match if shapes differ
        from skimage.transform import resize as sk_resize
        target_h, target_w = opt_arr.shape[1], opt_arr.shape[2]
        if sar_db.shape != (target_h, target_w):
            sar_db = sk_resize(sar_db, (target_h, target_w), preserve_range=True)

        # Optical indices
        # For a standard 4-band MS image: B1=Blue, B2=Green, B3=Red, B4=NIR
        # For 3-band RGB: B0=Red, B1=Green, B2=Blue (approximate)
        n_bands = opt_arr.shape[0]
        if n_bands >= 4:
            # Multispectral: Green=1, Red=2, NIR=3
            ndwi = _normalized_difference(opt_arr, 1, 3)   # (Green - NIR) / (Green + NIR)
            ndbi = _normalized_difference(opt_arr, 3, 1)   # approximate built-up
        else:
            # RGB fallback: Green=1, Red=0
            ndwi = _normalized_difference(opt_arr, 1, 0)
            ndbi = _normalized_difference(opt_arr, 0, 1)

        # SAR thresholds
        sar_threshold = _otsu_threshold(sar_db)
        water_sar = sar_db < sar_threshold
        built_sar = sar_db > np.percentile(sar_db[np.isfinite(sar_db)], 90)

        # Optical thresholds
        water_opt = ndwi > 0.0
        built_opt = ndbi > 0.0

        # Agreement and conflict masks
        water_agree = water_opt & water_sar
        built_agree = built_opt & built_sar
        water_conflict = water_opt & ~water_sar
        built_conflict = built_opt & ~built_sar

        total_px = float(max(water_opt.size, 1))

        facts = {
            "water_fraction_optical": round(float(water_opt.sum()) / total_px, 4),
            "water_fraction_sar": round(float(water_sar.sum()) / total_px, 4),
            "water_fraction_agreed": round(float(water_agree.sum()) / total_px, 4),
            "built_fraction_optical": round(float(built_opt.sum()) / total_px, 4),
            "built_fraction_sar": round(float(built_sar.sum()) / total_px, 4),
            "built_fraction_agreed": round(float(built_agree.sum()) / total_px, 4),
            "water_conflict_fraction": round(float(water_conflict.sum()) / total_px, 4),
            "built_conflict_fraction": round(float(built_conflict.sum()) / total_px, 4),
        }

        # Store masks as artifacts for downstream tools
        ctx.store_artifact("water_mask", water_agree)
        ctx.store_artifact("built_mask", built_agree)
        ctx.store_artifact("conflict_mask", water_conflict | built_conflict)

        # Render summary text
        text_parts = []
        w_pct = facts["water_fraction_agreed"] * 100
        b_pct = facts["built_fraction_agreed"] * 100
        wc_pct = facts["water_conflict_fraction"] * 100

        text_parts.append(
            f"Cross-modal analysis: {w_pct:.1f}% of the scene is water "
            f"(agreed by both optical and SAR sensors)."
        )
        text_parts.append(
            f"{b_pct:.1f}% is built-up area (agreed by both sensors)."
        )
        if wc_pct > 1.0:
            text_parts.append(
                f"{wc_pct:.1f}% shows conflict between sensors "
                f"(optical suggests water but SAR does not confirm)."
            )

        text = " ".join(text_parts)

        # Confidence from agreement
        conf = _agreement_confidence(water_agree, water_opt, water_sar)
        # Blend with built-up agreement
        conf_built = _agreement_confidence(built_agree, built_opt, built_sar)
        conf = 0.6 * conf + 0.4 * conf_built
        # Floor at 0.3 since deterministic tools always have some value
        conf = max(conf, 0.3)

        facts["sar_calibrated"] = sar_calibrated
        warnings = [] if sar_calibrated else [uncalibrated_warning(self.name)]

        basis = ("inter-sensor agreement fraction -- fully deterministic, "
                 "offline-capable, no learned prior")
        if not sar_calibrated:
            basis += ("; SAR thresholds derived from this scene's own dB "
                      "distribution because the product is uncalibrated")

        return ToolResult(
            tool=self.name,
            model_id=None,
            facts=facts,
            artifacts={
                "water_mask": "water_mask",
                "built_mask": "built_mask",
                "conflict_mask": "conflict_mask",
            },
            text=text,
            confidence=round(conf, 3),
            confidence_basis=basis,
            warnings=warnings,
        )
