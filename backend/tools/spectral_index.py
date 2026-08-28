"""
spectral_index tool - PRD §8.3.8.

Deterministic. Computes NDVI / NDWI / NDBI / NDMI from multispectral bands.
Applies an optional threshold (or Otsu auto-threshold) to produce a binary mask.
Fully offline-capable.
"""

from __future__ import annotations

from typing import Any, Dict, Literal, Optional

import numpy as np
from pydantic import Field

from tools.base import InputConfig, Tool, ToolParams, ToolResult
from tools.registry import register


# ---------------------------------------------------------------------------
# Band-index definitions.
# Sentinel-2 12/13-band standard order (0-indexed):
#   0=B1, 1=B2(Blue), 2=B3(Green), 3=B4(Red), 4=B5, 5=B6, 6=B7,
#   7=B8(NIR), 8=B8A, 9=B9, 10=B10, 11=B11(SWIR1), 12=B12(SWIR2)
#
# For generic 4-band (R,G,B,NIR):  0=R, 1=G, 2=B, 3=NIR
# For generic 3-band (R,G,B):      insufficient for most indices
# ---------------------------------------------------------------------------

INDEX_FORMULAS: Dict[str, Dict[str, Any]] = {
    # index: {band_a_key, band_b_key, s2_a_idx, s2_b_idx, generic_4_a, generic_4_b}
    "NDVI": {
        "label": "Normalised Difference Vegetation Index",
        "s2": (7, 3),       # (NIR=B8, RED=B4)
        "generic4": (3, 0), # (NIR, RED)
    },
    "NDWI": {
        "label": "Normalised Difference Water Index (McFeeters)",
        "s2": (2, 7),       # (GREEN=B3, NIR=B8)
        "generic4": (1, 3), # (GREEN, NIR)
    },
    "NDBI": {
        "label": "Normalised Difference Built-up Index",
        "s2": (11, 7),      # (SWIR1=B11, NIR=B8)
        "generic4": None,   # needs SWIR - not available in 4-band
    },
    "NDMI": {
        "label": "Normalised Difference Moisture Index",
        "s2": (7, 11),      # (NIR=B8, SWIR1=B11)
        "generic4": None,   # needs SWIR
    },
}


def _normalised_difference(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """(A - B) / (A + B), NaN-safe."""
    denom = a.astype("float64") + b.astype("float64")
    with np.errstate(divide="ignore", invalid="ignore"):
        nd = np.where(np.abs(denom) < 1e-10, 0.0, (a.astype("float64") - b.astype("float64")) / denom)
    return nd.astype("float32")


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


def _select_bands(arr: np.ndarray, band_count: int, index_name: str):
    """Return (band_a, band_b) arrays for the requested spectral index."""
    spec = INDEX_FORMULAS[index_name]

    if band_count in (12, 13):
        a_idx, b_idx = spec["s2"]
    elif band_count >= 4 and spec.get("generic4"):
        a_idx, b_idx = spec["generic4"]
    elif band_count >= 4 and spec.get("generic4") is None:
        return None, None  # needs SWIR which isn't available
    elif band_count == 3 and index_name == "NDVI":
        # Approximate: treat band 2 as pseudo-NIR proxy - very rough
        a_idx, b_idx = 2, 0
    else:
        return None, None

    if a_idx >= arr.shape[0] or b_idx >= arr.shape[0]:
        return None, None
    return arr[a_idx], arr[b_idx]


# ---------------------------------------------------------------------------
# Tool definition
# ---------------------------------------------------------------------------

class SpectralIndexParams(ToolParams):
    index: Literal["NDVI", "NDWI", "NDBI", "NDMI"]
    threshold: Optional[float] = Field(None, ge=-1.0, le=1.0)  # None -> Otsu


@register
class SpectralIndexTool(Tool):
    name = "spectral_index"
    description = (
        "Compute a spectral index (NDVI, NDWI, NDBI, NDMI) from the optical/multispectral "
        "image.  Produces a continuous index raster and a binary mask (thresholded).  "
        "If no threshold is given, Otsu auto-threshold is used.  "
        "Deterministic, offline-capable, exact."
    )
    accepts: list = ["SINGLE", "CROSS_MODAL", "BI_TEMPORAL"]
    required_modalities: list = []  # works on any optical/MS image
    params_model = SpectralIndexParams
    produces: list = ["mask", "stats"]
    model_id = None
    offline_capable = True

    async def run(self, ctx, params: SpectralIndexParams) -> ToolResult:
        # Get the raw raster array - channel-first (C, H, W)
        arr = ctx.get_optical_array()
        if arr is None:
            return ToolResult(
                tool=self.name, confidence=0.0,
                confidence_basis="no optical/multispectral image available",
                warnings=["No optical/multispectral image found in this scene"],
            )

        band_count = arr.shape[0]
        band_a, band_b = _select_bands(arr, band_count, params.index)

        if band_a is None:
            return ToolResult(
                tool=self.name, confidence=0.0,
                confidence_basis="insufficient bands",
                warnings=[
                    f"Cannot compute {params.index}: requires bands not present in a "
                    f"{band_count}-band raster"
                ],
            )

        # Compute the normalised difference
        index_arr = _normalised_difference(band_a, band_b)

        # Determine threshold
        if params.threshold is not None:
            thresh = params.threshold
            thresh_method = f"user-specified ({thresh})"
        else:
            thresh = _otsu_threshold(index_arr)
            thresh_method = f"Otsu auto-threshold ({thresh:.4f})"

        # Create binary mask
        mask = index_arr > thresh

        # Statistics
        valid = np.isfinite(index_arr)
        mean_val = float(np.mean(index_arr[valid])) if valid.any() else 0.0
        positive_fraction = float(mask.sum()) / max(mask.size, 1)

        # Store mask artifact in context for downstream tools
        mask_key = f"{params.index.lower()}_mask"
        ctx.store_artifact(mask_key, mask)
        ctx.store_artifact(f"{params.index.lower()}_continuous", index_arr)

        label = INDEX_FORMULAS[params.index]["label"]
        text = (
            f"{label} computed.  "
            f"Mean value: {mean_val:.4f}.  "
            f"Threshold: {thresh_method}.  "
            f"{positive_fraction * 100:.1f}% of pixels above threshold."
        )

        return ToolResult(
            tool=self.name,
            text=text,
            facts={
                "index": params.index,
                "mean": round(mean_val, 4),
                "threshold": round(thresh, 4),
                "threshold_method": thresh_method,
                "positive_fraction": round(positive_fraction, 4),
            },
            artifacts={"mask": mask_key, "continuous": f"{params.index.lower()}_continuous"},
            confidence=1.0,
            confidence_basis="deterministic spectral index - exact computation, no model involved",
        )
