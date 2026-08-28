"""
change_vqa tool - PRD §7.1, §8.3.6.  Question answering over a temporal pair (R4).

Hosted VLM (V1), both images, change-VQA template.  Same confidence method as
`rs_vqa`: a hedging-language heuristic on an unadapted hosted model, never a
calibrated score.  Measured `change_detect` facts are injected when available
so the answer is anchored to something that was actually computed.
"""

from __future__ import annotations

from tools._backends import error_result, unavailable_result
from tools.base import Tool, ToolParams, ToolResult
from tools.change_describe import build_facts_block
from tools.registry import register
from services.inference.vlm_gateway import (
    TEMPLATES, VLMUnavailable, heuristic_confidence, response_warnings, vlm_available, vlm_call,
)

BACKEND_LABEL = "the hosted VLM gateway (backend V1)"


class ChangeVQAParams(ToolParams):
    question: str


@register
class ChangeVQATool(Tool):
    name = "change_vqa"
    description = (
        "Answer a natural-language question about what changed between the two "
        "dates of a bi-temporal pair. Backed by a hosted general-purpose vision "
        "model with no remote-sensing fine-tuning; run change_detect first when "
        "the question asks how much changed, so the answer cites a measurement "
        "rather than an impression. Requires network access."
    )
    accepts: list = ["BI_TEMPORAL"]
    required_modalities: list = []
    params_model = ChangeVQAParams
    produces: list = ["text"]
    model_id = "V1"
    offline_capable = False

    async def run(self, ctx, p: ChangeVQAParams) -> ToolResult:
        ok, reason = vlm_available(getattr(ctx, "vlm_backend", None))
        if not ok:
            return unavailable_result(self.name, self.model_id, reason, BACKEND_LABEL)

        facts_block = build_facts_block(ctx)
        imgs = ctx.model_ready_images()
        instruction = TEMPLATES["change_vqa"].format(
            facts_block=facts_block, question=p.question)
        try:
            out = await vlm_call(imgs, instruction, backend=ctx.vlm_backend)
        except VLMUnavailable as e:
            return unavailable_result(self.name, self.model_id, str(e), BACKEND_LABEL)
        except Exception as e:  # noqa: BLE001
            return error_result(self.name, self.model_id, e, BACKEND_LABEL)

        conf = heuristic_confidence(out["text"])
        basis = (
            "heuristic hedging-language score on a hosted, unadapted VLM "
            "response - not self-consistency"
        )
        warnings = []
        if facts_block:
            basis += "; anchored to measured change_detect statistics"
        else:
            conf = min(conf, 0.45)
            basis += "; NOT anchored to any measurement (change_detect unavailable)"
            warnings.append(
                "No change_detect measurement was available to anchor this answer."
            )

        return ToolResult(
            tool=self.name,
            model_id="V1",
            model_version=f"{out['backend']}:{out['model']}",
            text=out["text"],
            facts={"answer": out["text"], "question": p.question,
                   "anchored": bool(facts_block)},
            confidence=round(conf, 3),
            confidence_basis=basis,
            warnings=warnings + response_warnings(out),
        )
