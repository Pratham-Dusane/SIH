"""
rs_vqa tool — PRD §7.1, §8.3.1.  **Mandatory R2.**

A thin wrapper around the hosted VLM gateway.  The backend is a general-purpose
model with no remote-sensing adaptation (§7.0): R1 is *not* satisfied here, and
the confidence returned is a hedging-language heuristic, not a calibrated score
and not the old self-consistency signal.
"""

from __future__ import annotations

from tools._backends import error_result, offline_mode, unavailable_result
from tools.base import Tool, ToolParams, ToolResult
from tools.registry import register
from services.inference.vlm_gateway import (
    TEMPLATES, VLMUnavailable, heuristic_confidence, response_warnings, vlm_available, vlm_call,
)

BACKEND_LABEL = "the hosted VLM gateway (backend V1)"

CONFIDENCE_BASIS = (
    "heuristic hedging-language score on a hosted, unadapted VLM response — "
    "not self-consistency"
)


class RSVQAParams(ToolParams):
    question: str


@register
class RSVQATool(Tool):
    name = "rs_vqa"
    description = (
        "Answer a natural-language question about the imagery using the "
        "vision-language model. Works on one image, an optical-SAR pair, "
        "or a bi-temporal pair. Backed by a hosted general-purpose vision "
        "model with no remote-sensing fine-tuning: prefer a deterministic tool "
        "whenever one can answer the sub-question, because deterministic "
        "outputs are exact and this one is not. Requires network access."
    )
    accepts: list = ["SINGLE", "CROSS_MODAL", "BI_TEMPORAL"]
    required_modalities: list = []
    params_model = RSVQAParams
    produces: list = ["text"]
    model_id = "V1"
    offline_capable = False

    async def run(self, ctx, p: RSVQAParams) -> ToolResult:
        ok, reason = vlm_available(getattr(ctx, "vlm_backend", None))
        if not ok:
            return unavailable_result(self.name, self.model_id, reason, BACKEND_LABEL)

        imgs = ctx.model_ready_images()
        instruction = TEMPLATES["vqa"].format(question=p.question)
        try:
            out = await vlm_call(imgs, instruction, backend=ctx.vlm_backend)
        except VLMUnavailable as e:
            return unavailable_result(self.name, self.model_id, str(e), BACKEND_LABEL)
        except Exception as e:  # noqa: BLE001 — a tool failure never aborts the plan
            return error_result(self.name, self.model_id, e, BACKEND_LABEL)

        # No self-consistency sampling by default (cost); confidence is a
        # heuristic on response hedging language, NOT a calibrated score —
        # labelled honestly in confidence_basis, never presented as equivalent
        # to the old self-consistency signal.
        conf = heuristic_confidence(out["text"])
        return ToolResult(
            tool=self.name,
            model_id="V1",
            model_version=f"{out['backend']}:{out['model']}",
            text=out["text"],
            facts={"answer": out["text"], "question": p.question},
            confidence=round(conf, 3),
            confidence_basis=CONFIDENCE_BASIS,
            warnings=response_warnings(out),
        )
