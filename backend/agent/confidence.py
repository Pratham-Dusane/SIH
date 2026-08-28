"""
Confidence aggregation and abstention - PRD §9.7.
"""

from __future__ import annotations

from typing import Any, Dict, List

from agent.plan_schema import ExecutionPlan
from agent.trace import Confidence


# ---------------------------------------------------------------------------
# Tool weights - how much each tool's confidence matters to the final answer
# PRD §9.7
# ---------------------------------------------------------------------------
TOOL_WEIGHTS: Dict[str, float] = {
    "rs_vqa":           1.0,
    "change_vqa":       1.0,
    "change_describe":  0.8,
    "rs_caption":       0.8,
    "rs_ground":        1.0,
    "change_detect":    0.9,
    "sar_optical_fuse": 1.0,
    "rs_classify":      0.6,
    "spectral_index":   0.3,
    "sar_water_mask":   0.3,
    "geo_stats":        0.1,   # deterministic: near-certain, low information
    "coreg_check":      0.2,
}

ABSTAIN_THRESHOLD = 0.35


def aggregate_confidence(results: Dict[str, Any], plan: ExecutionPlan) -> Confidence:
    """
    Weighted mean of tool confidences, penalised for skipped/failed steps.
    """
    contrib = []
    for r in results.values():
        if hasattr(r, "tool") and hasattr(r, "confidence") and r.confidence > 0:
            w = TOOL_WEIGHTS.get(r.tool, 0.5)
            contrib.append((r.tool, r.confidence, w))

    if not contrib:
        return Confidence(
            value=0.0,
            band="LOW",
            basis="no tool produced a usable result",
            contributions=[],
        )

    num = sum(c * w for _, c, w in contrib)
    den = sum(w for _, _, w in contrib)
    value = num / den

    # A failed or skipped step in the plan reduces confidence proportionally:
    # answering from half the planned evidence should not look as certain as
    # answering from all of it.
    executed = len([r for r in results.values()
                    if hasattr(r, "confidence") and r.confidence > 0])
    value *= 0.7 + 0.3 * (executed / max(len(plan.steps), 1))

    # Any misregistration warning caps the ceiling
    for r in results.values():
        if hasattr(r, "warnings"):
            if any("misregistration" in w.lower() for w in r.warnings):
                value = min(value, 0.5)
                break

    band = "HIGH" if value >= 0.75 else ("MEDIUM" if value >= 0.45 else "LOW")

    return Confidence(
        value=round(value, 3),
        band=band,
        basis=(
            f"weighted mean over {len(contrib)} tools, "
            f"{executed}/{len(plan.steps)} steps completed"
        ),
        contributions=[
            {"tool": t, "confidence": c, "weight": w} for t, c, w in contrib
        ],
    )


def should_abstain(confidence: Confidence) -> bool:
    return confidence.value < ABSTAIN_THRESHOLD
