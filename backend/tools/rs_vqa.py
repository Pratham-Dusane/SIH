"""
rs_vqa tool - PRD §7.1, §8.3.1.  **Mandatory R2.**

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
    "heuristic hedging-language score on a hosted, unadapted VLM response - "
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

        user_bbox = ctx.get_user_annotation_bbox() if hasattr(ctx, "get_user_annotation_bbox") else None
        if user_bbox:
            ymin, xmin, ymax, xmax = user_bbox
            instruction += (
                f"\n\n[SPATIAL FOCUS - USER ANNOTATION]:\n"
                f"The user has highlighted / drawn an annotation on the image at normalized bounding coordinates:\n"
                f"• Top: {ymin*100:.1f}%, Left: {xmin*100:.1f}%, Bottom: {ymax*100:.1f}%, Right: {xmax*100:.1f}%\n"
                f"• Bounding Box: (ymin={ymin:.3f}, xmin={xmin:.3f}, ymax={ymax:.3f}, xmax={xmax:.3f})\n"
                f"Please focus your analysis directly on the visual features, structures, or objects located within or indicated by this marked region."
            )

        # Inject spatial resolution & physical GSD metadata
        gsd_m = ctx.scene_gsd_x_m() if hasattr(ctx, "scene_gsd_x_m") else None
        if gsd_m:
            instruction += f"\n• Spatial Resolution (GSD): {gsd_m:.2f} meters per pixel."

        # Inject deterministic measurement facts produced by prior tool steps (geo_stats, spectral_index)
        prior_facts: list[str] = []
        if hasattr(ctx, "results") and ctx.results:
            for step_id, res in ctx.results.items():
                if getattr(res, "tool", None) == "geo_stats" and getattr(res, "facts", None):
                    f = res.facts
                    if "area_ha" in f:
                        prior_facts.append(
                            f"• Deterministic Area Measurement: {f['area_ha']:.2f} hectares ({f.get('area_m2', 0):,.1f} m²), "
                            f"occupying {f.get('positive_pixels', 0):,} pixels ({f.get('percent', 0):.2f}% of the scene footprint)."
                        )
                elif getattr(res, "tool", None) == "spectral_index" and getattr(res, "facts", None):
                    f = res.facts
                    prior_facts.append(
                        f"• Spectral Index ({f.get('index')}): Mean = {f.get('mean')}, {f.get('positive_fraction', 0)*100:.1f}% positive pixels."
                    )

        if prior_facts:
            instruction += (
                "\n\n[DETERMINISTIC PHYSICAL MEASUREMENTS PRODUCED BY TOOLS]:\n"
                + "\n".join(prior_facts)
                + "\nPlease cite and integrate these exact physical measurements directly in your answer."
            )

        try:
            out = await vlm_call(imgs, instruction, backend=ctx.vlm_backend)
        except VLMUnavailable as e:
            return unavailable_result(self.name, self.model_id, str(e), BACKEND_LABEL)
        except Exception as e:  # noqa: BLE001 - a tool failure never aborts the plan
            return error_result(self.name, self.model_id, e, BACKEND_LABEL)

        # No self-consistency sampling by default (cost); confidence is a
        # heuristic on response hedging language, NOT a calibrated score -
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
