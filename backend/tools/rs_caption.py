"""
rs_caption tool - PRD §7.1, §8.3.2.  Single-image captioning (R3).

Same shape as rs_vqa using V1, `accepts=["SINGLE"]`, params
`{detail: Literal["brief","standard","detailed"] = "standard"}`.
`detail` maps to fixed prompt variants from §7.1 - it never becomes free text.
"""

from __future__ import annotations

from typing import Literal

from tools._backends import error_result, unavailable_result
from tools.base import Tool, ToolParams, ToolResult
from tools.registry import register
from services.inference.vlm_gateway import (
    TEMPLATES, VLMUnavailable, heuristic_confidence, response_warnings, vlm_available, vlm_call,
)

BACKEND_LABEL = "the hosted VLM gateway (backend V1)"


class RSCaptionParams(ToolParams):
    detail: Literal["brief", "standard", "detailed"] = "standard"


@register
class RSCaptionTool(Tool):
    name = "rs_caption"
    description = (
        "Generate a natural-language description of a single satellite image: "
        "dominant land-cover types, structures and spatial layout. Backed by a "
        "hosted general-purpose vision model with no remote-sensing fine-tuning, "
        "so it produces narrative, never measurements - pair it with "
        "spectral_index/geo_stats when the answer needs a number. "
        "Requires network access."
    )
    accepts: list = ["SINGLE"]
    required_modalities: list = []
    params_model = RSCaptionParams
    produces: list = ["text"]
    model_id = "V1"
    offline_capable = False

    async def run(self, ctx, p: RSCaptionParams) -> ToolResult:
        ok, reason = vlm_available(getattr(ctx, "vlm_backend", None))
        if not ok:
            return unavailable_result(self.name, self.model_id, reason, BACKEND_LABEL)

        imgs = ctx.model_ready_images()
        instruction = TEMPLATES[f"caption_{p.detail}"]
        try:
            out = await vlm_call(imgs, instruction, backend=ctx.vlm_backend)
        except VLMUnavailable as e:
            return unavailable_result(self.name, self.model_id, str(e), BACKEND_LABEL)
        except Exception as e:  # noqa: BLE001
            return error_result(self.name, self.model_id, e, BACKEND_LABEL)

        conf = heuristic_confidence(out["text"])
        return ToolResult(
            tool=self.name,
            model_id="V1",
            model_version=f"{out['backend']}:{out['model']}",
            text=out["text"],
            facts={"caption": out["text"], "detail": p.detail},
            confidence=round(conf, 3),
            confidence_basis=(
                "heuristic hedging-language score on a hosted, unadapted VLM "
                "response - not self-consistency"
            ),
            warnings=response_warnings(out),
        )
