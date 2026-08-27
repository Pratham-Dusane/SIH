"""
change_describe tool — PRD §7.1, §8.3.5.  Natural-language change description (R4).

Hosted VLM (V1) with both images and the change-description template.  Injects
`change_detect` facts into the prompt when available (`ctx.prior("change_detect")`)
— unchanged behaviour from old §8.3.5, and *more* important now that the
narrative half is unadapted: the quantitative anchor is the only part of this
answer that was actually measured.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from tools._backends import error_result, unavailable_result
from tools.base import Tool, ToolParams, ToolResult
from tools.registry import register
from services.inference.vlm_gateway import (
    TEMPLATES, VLMUnavailable, heuristic_confidence, response_warnings, vlm_available, vlm_call,
)

BACKEND_LABEL = "the hosted VLM gateway (backend V1)"

DIRECTION_LABELS = {
    "built_up_increase": "built-up area increased (NDBI up, NDVI down)",
    "vegetation_increase": "vegetation increased",
    "vegetation_decrease": "vegetation decreased",
    "unchanged": "no significant change",
    "unknown": "direction could not be determined",
}


def build_facts_block(ctx) -> str:
    """
    Render measured change statistics from a prior `change_detect` step into a
    prompt block.  Empty string when no measurement exists — the template then
    simply has no quantitative anchor, and the tool says so in its warnings.
    """
    prior = ctx.prior("change_detect") if hasattr(ctx, "prior") else None
    if prior is None or not getattr(prior, "facts", None):
        return ""
    f: Dict[str, Any] = prior.facts
    if f.get("status"):        # NOT_EVALUATED_OFFLINE / BACKEND_UNAVAILABLE
        return ""

    lines = ["Measured statistics from the deterministic change-detection step "
             "(use these numbers verbatim, do not restate them differently):"]
    if f.get("changed_fraction") is not None:
        lines.append(f"- changed area: {float(f['changed_fraction']) * 100:.2f}% of the AOI")
    if f.get("changed_area_ha") is not None:
        lines.append(f"- changed area: {float(f['changed_area_ha']):,.1f} hectares")
    if f.get("ndvi_delta_mean") is not None:
        lines.append(f"- mean NDVI change (T2 - T1): {float(f['ndvi_delta_mean']):+.4f}")
    if f.get("ndbi_delta_mean") is not None:
        lines.append(f"- mean NDBI change (T2 - T1): {float(f['ndbi_delta_mean']):+.4f}")
    if f.get("direction"):
        lines.append(f"- overall direction: {DIRECTION_LABELS.get(f['direction'], f['direction'])}")
    return "\n".join(lines) + "\n"


class ChangeDescribeParams(ToolParams):
    pass


@register
class ChangeDescribeTool(Tool):
    name = "change_describe"
    description = (
        "Describe in natural language what changed between the two dates of a "
        "bi-temporal pair, stating the direction of change. Backed by a hosted "
        "general-purpose vision model with no remote-sensing fine-tuning; run "
        "change_detect first so this step is anchored to measured statistics "
        "rather than narrating from pixels alone. Requires network access."
    )
    accepts: list = ["BI_TEMPORAL"]
    required_modalities: list = []
    params_model = ChangeDescribeParams
    produces: list = ["text"]
    model_id = "V1"
    offline_capable = False

    async def run(self, ctx, p: ChangeDescribeParams) -> ToolResult:
        ok, reason = vlm_available(getattr(ctx, "vlm_backend", None))
        if not ok:
            return unavailable_result(self.name, self.model_id, reason, BACKEND_LABEL)

        facts_block = build_facts_block(ctx)
        warnings = []
        if not facts_block:
            warnings.append(
                "No change_detect measurement was available to anchor this "
                "description — the narrative is unquantified and unadapted."
            )

        imgs = ctx.model_ready_images()
        instruction = TEMPLATES["change_describe"].format(facts_block=facts_block)
        try:
            out = await vlm_call(imgs, instruction, backend=ctx.vlm_backend)
        except VLMUnavailable as e:
            return unavailable_result(self.name, self.model_id, str(e), BACKEND_LABEL)
        except Exception as e:  # noqa: BLE001
            return error_result(self.name, self.model_id, e, BACKEND_LABEL)

        conf = heuristic_confidence(out["text"])
        basis = (
            "heuristic hedging-language score on a hosted, unadapted VLM "
            "response — not self-consistency"
        )
        if facts_block:
            basis += "; anchored to measured change_detect statistics"
        else:
            # Unanchored narrative from an unadapted model is the weakest
            # evidence this system produces — cap it so fusion treats it that way.
            conf = min(conf, 0.45)
            basis += "; NOT anchored to any measurement (change_detect unavailable)"

        return ToolResult(
            tool=self.name,
            model_id="V1",
            model_version=f"{out['backend']}:{out['model']}",
            text=out["text"],
            facts={"description": out["text"], "anchored": bool(facts_block)},
            confidence=round(conf, 3),
            confidence_basis=basis,
            warnings=warnings + response_warnings(out),
        )
