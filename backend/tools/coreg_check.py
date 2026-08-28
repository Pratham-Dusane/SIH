"""
coreg_check tool - PRD §8.3.8.

Deterministic, on-demand co-registration re-validation.
Re-runs phase-cross-correlation on the scene pair and reports
shift in pixels plus overlap percentage.
Fully offline-capable.
"""

from __future__ import annotations

import numpy as np
from skimage.registration import phase_cross_correlation
from skimage.transform import resize

from tools.base import Tool, ToolParams, ToolResult
from tools.registry import register


class CoregCheckParams(ToolParams):
    """No parameters required - operates on the scene pair as-is."""
    pass


def _to_gray_512(arr: np.ndarray) -> np.ndarray:
    """Convert a channel-first array (C, H, W) to a grayscale 512x512 float image."""
    if arr.ndim == 3:
        gray = arr.mean(axis=0)
    else:
        gray = arr
    # Percentile stretch to [0, 1]
    lo, hi = np.nanpercentile(gray, [2, 98])
    denom = max(float(hi - lo), 1e-6)
    gray = np.clip((gray - lo) / denom, 0.0, 1.0)
    gray = np.nan_to_num(gray, nan=0.0)
    # Resize to 512x512
    return resize(gray, (512, 512), anti_aliasing=True, preserve_range=True).astype("float64")


@register
class CoregCheckTool(Tool):
    name = "coreg_check"
    description = (
        "On-demand co-registration check for image pairs.  Estimates sub-pixel "
        "misregistration using phase cross-correlation.  Reports shift in pixels "
        "and normalised error.  Deterministic, offline-capable."
    )
    accepts: list = ["CROSS_MODAL", "BI_TEMPORAL"]
    required_modalities: list = []
    params_model = CoregCheckParams
    produces: list = ["stats"]
    model_id = None
    offline_capable = True

    async def run(self, ctx, params: CoregCheckParams) -> ToolResult:
        arr_a = ctx.get_image_array("a")
        arr_b = ctx.get_image_array("b")

        if arr_a is None or arr_b is None:
            return ToolResult(
                tool=self.name, confidence=0.0,
                confidence_basis="requires two images for co-registration check",
                warnings=["Scene does not have two images for co-registration check"],
            )

        ga = _to_gray_512(arr_a)
        gb = _to_gray_512(arr_b)

        try:
            (dy, dx), err, _ = phase_cross_correlation(ga, gb, upsample_factor=4)
        except Exception as e:
            return ToolResult(
                tool=self.name, confidence=0.0,
                confidence_basis=f"phase correlation failed: {e}",
                warnings=[f"Phase cross-correlation failed: {e}"],
            )

        # Scale shift back to original image dimensions
        max_dim = max(
            max(arr_a.shape[-2:]) if arr_a.ndim >= 2 else 512,
            max(arr_b.shape[-2:]) if arr_b.ndim >= 2 else 512,
        )
        scale = max_dim / 512.0
        shift_px = float(np.hypot(dy, dx) * scale)
        norm_err = float(err) if np.isfinite(err) else 1.0

        # Assess quality
        if shift_px <= 2.0:
            status = "PASS"
            quality = "well co-registered"
        elif shift_px <= 8.0:
            status = "WARN"
            quality = "moderate misregistration - proceed with caution"
        else:
            status = "FAIL"
            quality = "poor co-registration - change detection will be unreliable"

        # Compute overlap from the scene metadata if available
        overlap = ctx.scene_overlap_fraction()

        text = (
            f"Co-registration check: shift {shift_px:.2f} px "
            f"(normalised error {norm_err:.3f}).  "
            f"Status: {status} - {quality}."
        )
        if overlap is not None:
            text += f"  Spatial overlap: {overlap * 100:.1f}%."

        conf = 0.97 if status == "PASS" else (0.6 if status == "WARN" else 0.2)

        return ToolResult(
            tool=self.name,
            text=text,
            facts={
                "shift_px": round(shift_px, 2),
                "normalised_error": round(norm_err, 3),
                "status": status,
                "overlap_fraction": round(overlap, 4) if overlap is not None else None,
            },
            confidence=conf,
            confidence_basis=f"phase cross-correlation at 4× upsample - shift {shift_px:.2f} px",
        )
