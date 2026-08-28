"""
Stub tools - placeholder registrations for capabilities not yet built.

The VLM-backed tools (rs_vqa, rs_caption, rs_ground, change_describe,
change_vqa) and the GEE-backed tools (rs_classify, change_detect) were stubs
until Phase 4; they now live in their own modules and call real backends.

What remains here is `sar_optical_fuse` (PRD §8.3.7), which belongs to Phase 5
step 12 and is deterministic - it needs optical+SAR array alignment, not a
hosted backend.
"""

from __future__ import annotations

from pydantic import Field

from tools.base import Tool, ToolParams, ToolResult
from tools.registry import register


# ---------------------------------------------------------------------------
# Cross-modal fusion stub (deterministic, but depends on both streams)
# ---------------------------------------------------------------------------

class FuseParams(ToolParams):
    targets: list = Field(default=["all"])
    agreement_only: bool = False


@register
class SAROpticalFuseTool(Tool):
    name = "sar_optical_fuse"
    description = (
        "Joint optical+SAR extraction via inter-sensor agreement. "
        "No learned fusion head - deterministic agreement of NDWI/NDBI "
        "vs SAR backscatter."
    )
    accepts: list = ["CROSS_MODAL"]
    required_modalities: list = ["SAR", "OPTICAL|MULTISPECTRAL"]
    params_model = FuseParams
    produces: list = ["stats", "mask", "text"]
    model_id = None
    offline_capable = True

    async def run(self, ctx, p: FuseParams) -> ToolResult:
        # This is a stub - the full implementation needs both optical and SAR
        # arrays properly loaded and aligned.
        return ToolResult(
            tool=self.name, confidence=0.0,
            confidence_basis="sar_optical_fuse stub - full implementation pending",
            text="[Cross-modal fusion not yet wired - needs optical+SAR alignment]",
            warnings=["sar_optical_fuse stub"],
        )
