"""
Fusion — PRD §9.6.

Two modes, both constrained.  Neither is allowed to introduce a fact.

Mode A — template (default, offline-safe).
Mode B — LLM composition (FUSION_BACKEND=vertex), Phase 7 enhancement.

Includes the numeric grounding check that catches invented statistics.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from agent.task_classifier import TaskType


# ---------------------------------------------------------------------------
# Numeric grounding check — runs on both modes and is not optional.
# Catches the exact failure this system exists to prevent: a fluent,
# plausible, invented statistic.
# PRD §9.6
# ---------------------------------------------------------------------------
NUM = re.compile(r"-?\d+(?:\.\d+)?")


def _walk_numbers(obj: Any) -> List[float]:
    """Recursively extract all numeric values from a dict/list."""
    nums = []
    if isinstance(obj, (int, float)):
        nums.append(float(obj))
    elif isinstance(obj, dict):
        for v in obj.values():
            nums.extend(_walk_numbers(v))
    elif isinstance(obj, (list, tuple)):
        for v in obj:
            nums.extend(_walk_numbers(v))
    return nums


def _is_year_or_ordinal(n: str) -> bool:
    """Don't flag years (2020) or ordinals (1st, 2nd) as unsupported numbers."""
    try:
        val = int(float(n))
        return 1900 <= val <= 2100  # likely a year
    except ValueError:
        return False


def verify_grounded(answer: str, results: Dict[str, Any]) -> Tuple[bool, List[str]]:
    """
    Every number in the answer must be traceable to a tool output.
    On failure: fall back to Mode A rendering and record the event in the trace.
    """
    allowed = set()
    for r in results.values():
        if hasattr(r, "facts"):
            for v in _walk_numbers(r.facts):
                # Allow exact, 1dp, 2dp, and percentage representations
                allowed |= {f"{v:.0f}", f"{v:.1f}", f"{v:.2f}",
                            f"{v*100:.0f}", f"{v*100:.1f}"}
        if hasattr(r, "text") and r.text:
            allowed |= set(NUM.findall(r.text))

    unsupported = [
        n for n in NUM.findall(answer)
        if n not in allowed and not _is_year_or_ordinal(n)
    ]
    return not unsupported, unsupported


# ---------------------------------------------------------------------------
# Template renderers — one per task type
# ---------------------------------------------------------------------------

def _render_vqa(results: Dict[str, Any], query: str) -> str:
    """Render a VQA answer from tool results."""
    vqa = _find_result(results, "rs_vqa")
    if vqa and vqa.text:
        parts = [vqa.text]
        # Append deterministic measurements if available
        gs = _find_result(results, "geo_stats")
        if gs and gs.text:
            parts.append(gs.text)
        return " ".join(parts)
    return "Unable to produce a confident answer for this query."


def _render_caption(results: Dict[str, Any]) -> str:
    caption = _find_result(results, "rs_caption")
    classify = _find_result(results, "rs_classify")
    parts = []
    if classify and classify.text:
        parts.append(classify.text)
    if caption and caption.text:
        parts.append(caption.text)
    return " ".join(parts) if parts else "Unable to generate a caption for this image."


def _render_grounding(results: Dict[str, Any]) -> str:
    ground = _find_result(results, "rs_ground")
    gs = _find_result(results, "geo_stats")
    parts = []
    if ground and ground.text:
        parts.append(ground.text)
    if gs and gs.text:
        parts.append(gs.text)
    return " ".join(parts) if parts else "Unable to locate the requested region."


def _render_change_answer(results: Dict[str, Any], scene=None) -> str:
    """PRD §9.6 — template renderer for change tasks."""
    cd = _find_result(results, "change_detect")
    gs = _find_result(results, "geo_stats")
    cdesc = _find_result(results, "change_describe")
    parts = []

    if cd:
        f = cd.facts
        changed_pct = f.get("changed_fraction", 0) * 100 if "changed_fraction" in f else None
        text = f"About {changed_pct:.1f}% of the overlapping area changed between the two acquisitions" if changed_pct else ""
        if gs and gs.facts.get("area_ha"):
            text += f" ({gs.facts['area_ha']:.1f} ha)."
        elif text:
            text += "."
        if text:
            parts.append(text)

        n_comp = f.get("n_components")
        if n_comp:
            parts.append(f"The change is distributed across {n_comp} distinct regions.")

        direction = f.get("direction_hint")
        if direction:
            parts.append(f"Built-up signal indicates an overall {direction}.")

    if cdesc and cdesc.text:
        parts.append(cdesc.text)

    return " ".join(parts) if parts else "Unable to describe the change between the two images."


def _render_cross_modal(results: Dict[str, Any]) -> str:
    fuse = _find_result(results, "sar_optical_fuse")
    gs = _find_result(results, "geo_stats")
    vqa = _find_result(results, "rs_vqa")
    parts = []

    if fuse and fuse.text:
        parts.append(fuse.text)
    if gs and gs.text:
        parts.append(gs.text)
    if vqa and vqa.text:
        parts.append(vqa.text)

    return " ".join(parts) if parts else "Unable to produce a cross-modal analysis."


def _find_result(results: Dict[str, Any], tool_name: str):
    """Find the first result from a given tool in the results dict."""
    for r in results.values():
        if hasattr(r, "tool") and r.tool == tool_name:
            return r
    return None


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

RENDERERS = {
    TaskType.SINGLE_VQA:           lambda r, q, s: _render_vqa(r, q),
    TaskType.SINGLE_CAPTION:       lambda r, q, s: _render_caption(r),
    TaskType.SINGLE_GROUNDING:     lambda r, q, s: _render_grounding(r),
    TaskType.CHANGE_DESCRIPTION:   lambda r, q, s: _render_change_answer(r, s),
    TaskType.CHANGE_MAP:           lambda r, q, s: _render_change_answer(r, s),
    TaskType.CHANGE_VQA:           lambda r, q, s: _render_vqa(r, q),
    TaskType.CROSS_MODAL_ANALYSIS: lambda r, q, s: _render_cross_modal(r),
    TaskType.LAND_COVER_ANALYSIS:  lambda r, q, s: _render_caption(r),
}


async def fuse(
    query: str,
    task_classification,
    results: Dict[str, Any],
    scene,
) -> str:
    """
    Produce the final answer by combining tool results.
    Mode A (template) is the default and offline-safe path.
    """
    renderer = RENDERERS.get(task_classification.task)
    if renderer:
        answer = renderer(results, query, scene)
    else:
        answer = _render_vqa(results, query)

    # Numeric grounding check
    ok, unsupported = verify_grounded(answer, results)
    if not ok:
        # Fall back to a safer rendering — just concatenate tool texts
        safe_parts = []
        for r in results.values():
            if hasattr(r, "text") and r.text:
                safe_parts.append(r.text)
        if safe_parts:
            answer = " ".join(safe_parts)
        # The trace will record the grounding failure

    return answer


def collect_evidence(results: Dict[str, Any]) -> Dict[str, Any]:
    """Collect all evidence artifacts from tool results for the frontend."""
    evidence = {}
    for step_id, r in results.items():
        if hasattr(r, "artifacts") and r.artifacts:
            for key, val in r.artifacts.items():
                evidence[f"{step_id}.{key}"] = val
    return evidence


def abstain(answer: str, confidence, results: Dict[str, Any]) -> str:
    """
    Replace the answer with an explicit statement of insufficient evidence.
    High-confidence individual facts are still reported.
    PRD §9.7.
    """
    high_conf_facts = []
    for r in results.values():
        if hasattr(r, "confidence") and r.confidence >= 0.75:
            if hasattr(r, "text") and r.text:
                high_conf_facts.append(r.text)

    parts = [
        "I cannot produce a confident answer for this query "
        f"(overall confidence: {confidence.value:.0%})."
    ]
    if high_conf_facts:
        parts.append("However, the following was established with high confidence:")
        parts.extend(f"• {f}" for f in high_conf_facts)
    parts.append(
        "To improve confidence, consider uploading higher-resolution imagery, "
        "co-registering the pair more tightly, or rephrasing the question."
    )
    return "\n".join(parts)
