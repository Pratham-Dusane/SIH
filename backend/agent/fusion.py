"""
Fusion - PRD §9.6.

Two modes, both constrained.  Neither is allowed to introduce a fact.

Mode A - template (default, offline-safe).
Mode B - LLM composition (FUSION_BACKEND=vertex), Phase 7 enhancement.

Includes the numeric grounding check that catches invented statistics.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel

from agent.task_classifier import TaskType


# ---------------------------------------------------------------------------
# Numeric grounding check - runs on both modes and is not optional.
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
    """Don't flag years (2020), ordinals (1st, 2nd), or small list integers (1..9) as unsupported numbers."""
    try:
        val = float(n)
        if val.is_integer():
            int_val = int(val)
            if 1900 <= int_val <= 2100:  # likely a year
                return True
            if 1 <= int_val <= 9 and "." not in n:  # list / section numbers 1-9
                return True
        return False
    except ValueError:
        return False


def _fact_numbers(r: Any) -> set:
    """
    Number strings backed by a tool's machine-checkable `facts`.

    A fraction may legitimately be rendered as itself or as a percentage, at
    0-2 decimal places either way.  The percentage forms need the same 2dp
    allowance as the raw value: `change_detect` reports `changed_fraction`
    0.0812 and every renderer writes it as "8.12%", so omitting that form made
    the grounding check reject a figure it had just derived from a measurement.
    """
    allowed = set()
    for v in _walk_numbers(getattr(r, "facts", {}) or {}):
        allowed |= {f"{v:.0f}", f"{v:.1f}", f"{v:.2f}",
                    f"{v * 100:.0f}", f"{v * 100:.1f}", f"{v * 100:.2f}"}
    return allowed


def verify_grounded(answer: str, results: Dict[str, Any]) -> Tuple[bool, List[str]]:
    """
    Every number in the answer must be traceable to a tool output (§9.6).
    On failure the caller falls back to Mode A rendering and records the event.
    """
    allowed = set()
    for r in results.values():
        allowed |= _fact_numbers(r)
        if getattr(r, "text", None):
            allowed |= set(NUM.findall(r.text))

    unsupported = [
        n for n in NUM.findall(answer)
        if n not in allowed and not _is_year_or_ordinal(n)
    ]
    return not unsupported, unsupported


def unverified_numbers(answer: str, results: Dict[str, Any]) -> List[str]:
    """
    Numbers whose only support is prose from an unadapted hosted VLM.

    `verify_grounded` treats any tool's `text` as a source, which is what §9.6
    specifies - but it means a figure the VLM invents whitelists itself, and the
    VLM is precisely the component with no measurement behind it.  These numbers
    are not errors and must not be suppressed; they are reported in the trace so
    a reader can see which figures were measured and which were merely stated.
    """
    measured = set()
    vlm_stated = set()
    for r in results.values():
        measured |= _fact_numbers(r)
        text = getattr(r, "text", None)
        if not text:
            continue
        if getattr(r, "model_id", None) == "V1":       # hosted VLM backend
            vlm_stated |= set(NUM.findall(text))
        else:
            measured |= set(NUM.findall(text))

    return sorted({
        n for n in NUM.findall(answer)
        if n in vlm_stated and n not in measured and not _is_year_or_ordinal(n)
    })


# ---------------------------------------------------------------------------
# Template renderers - one per task type
# ---------------------------------------------------------------------------

def _no_output(expected: List[str], results: Dict[str, Any]) -> str:
    """
    Honest fallback when a renderer finds none of the tools it reads.

    "Unable to produce a confident answer" is the wrong thing to say here: it
    reads as low confidence when the truth is that the step which should have
    answered produced nothing.  Naming the tool makes a renderer/plan mismatch
    visible instead of letting it masquerade as an abstention.
    """
    ran = sorted({getattr(r, "tool", "?") for r in results.values()})
    expected_str = " or ".join(expected)
    if not ran:
        return (f"No answer was produced: no tool completed for this query "
                f"(expected output from {expected_str}).")
    return (f"No answer was produced: this query needs output from {expected_str}, "
            f"but the steps that ran were {', '.join(ran)}.")


def _render_vqa(results: Dict[str, Any], query: str) -> str:
    """Render a VQA answer from tool results."""
    vqa = _find_result(results, "rs_vqa")
    if vqa and vqa.text:
        parts = [vqa.text]
        # Append deterministic measurements if available
        gs = _find_result(results, "geo_stats")
        if gs and gs.text:
            parts.append(f"**Measurement:** {gs.text}")
        return "\n\n".join(parts)
    return _no_output(["rs_vqa"], results)


def _render_change_vqa(results: Dict[str, Any], query: str) -> str:
    """
    Answer a question about a bi-temporal pair.

    `change_vqa` carries the narrative and `change_detect` the measurement, the
    same pairing `_render_change_answer` uses for change descriptions.  This
    renderer exists because CHANGE_VQA previously routed to `_render_vqa`, which
    looks for `rs_vqa` - a tool that task never plans.  The lookup always missed
    and a perfectly good `change_vqa` answer was replaced by the fallback string.
    """
    cvqa = _find_result(results, "change_vqa")
    cd = _find_result(results, "change_detect")
    gs = _find_result(results, "geo_stats")

    parts: List[str] = []
    if cvqa and cvqa.text:
        parts.append(cvqa.text)

    # Anchor the narrative to whatever was actually measured.
    if cd and cd.facts and not cd.facts.get("status"):
        f = cd.facts
        measured = []
        if f.get("changed_fraction") is not None:
            measured.append(f"{float(f['changed_fraction']) * 100:.2f}% of the AOI changed")
        if f.get("changed_area_ha") is not None:
            measured.append(f"{float(f['changed_area_ha']):,.1f} ha")
        if measured:
            parts.append("**Measured Change:** " + ", ".join(measured) + ".")
    if gs and gs.text:
        parts.append(gs.text)

    if parts:
        return "\n\n".join(parts)
    return _no_output(["change_vqa", "change_detect"], results)


def _render_caption(results: Dict[str, Any]) -> str:
    caption = _find_result(results, "rs_caption")
    classify = _find_result(results, "rs_classify")
    parts = []
    if caption and caption.text:
        parts.append(caption.text)
    if classify and classify.text:
        parts.append(classify.text)
    return "\n\n".join(parts) if parts else _no_output(["rs_caption", "rs_classify"], results)


def _render_grounding(results: Dict[str, Any]) -> str:
    ground = _find_result(results, "rs_ground")
    gs = _find_result(results, "geo_stats")
    parts = []
    if ground and ground.text:
        parts.append(ground.text)
    if gs and gs.text:
        parts.append(f"**Area Measurement:** {gs.text}")
    return "\n\n".join(parts) if parts else _no_output(["rs_ground"], results)


def _render_change_answer(results: Dict[str, Any], scene=None) -> str:
    """PRD §9.6 - template renderer for change tasks."""
    cd = _find_result(results, "change_detect")
    gs = _find_result(results, "geo_stats")
    cdesc = _find_result(results, "change_describe")
    parts = []

    if cdesc and cdesc.text:
        parts.append(cdesc.text)

    stats_parts = []
    if cd:
        f = cd.facts
        changed_pct = f.get("changed_fraction", 0) * 100 if "changed_fraction" in f else None
        if changed_pct:
            text = f"• **Changed Extent:** About {changed_pct:.1f}% of the overlapping area changed"
            if gs and gs.facts.get("area_ha"):
                text += f" ({gs.facts['area_ha']:.1f} ha)."
            else:
                text += "."
            stats_parts.append(text)

        n_comp = f.get("n_components")
        if n_comp:
            stats_parts.append(f"• **Spatial Distribution:** The change is distributed across {n_comp} distinct regions.")

        direction = f.get("direction_hint")
        if direction:
            stats_parts.append(f"• **Trend:** Built-up signal indicates an overall {direction}.")

    if stats_parts:
        parts.append("**Quantitative Change Analysis:**\n" + "\n".join(stats_parts))

    return "\n\n".join(parts) if parts else _no_output(
        ["change_detect", "change_describe"], results)


def _render_cross_modal(results: Dict[str, Any]) -> str:
    fuse = _find_result(results, "sar_optical_fuse")
    gs = _find_result(results, "geo_stats")
    vqa = _find_result(results, "rs_vqa")
    parts = []

    if vqa and vqa.text:
        parts.append(vqa.text)
    if fuse and fuse.text:
        parts.append(fuse.text)
    if gs and gs.text:
        parts.append(f"**Measurement:** {gs.text}")

    return "\n\n".join(parts) if parts else _no_output(
        ["sar_optical_fuse", "rs_vqa"], results)


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
    TaskType.CHANGE_VQA:           lambda r, q, s: _render_change_vqa(r, q),
    TaskType.CROSS_MODAL_ANALYSIS: lambda r, q, s: _render_cross_modal(r),
    TaskType.LAND_COVER_ANALYSIS:  lambda r, q, s: _render_caption(r),
}


class FusionResult(BaseModel):
    """
    The answer plus an honest record of how it was produced.

    The grounding outcome has to travel with the answer.  Reporting a fixed
    "PASS" in the trace while the check actually failed would fabricate exactly
    the provenance R11 exists to prove.
    """
    answer: str
    mode: str                                  # "template" | "fallback_concat"
    grounding_check: str                       # "PASS" | "FAIL"
    unsupported_numbers: List[str] = []
    # Figures stated only by the hosted VLM, with no measurement behind them.
    # Not a failure - but a reader of the trace should know which is which.
    unverified_numbers: List[str] = []


async def fuse(
    query: str,
    task_classification,
    results: Dict[str, Any],
    scene,
) -> FusionResult:
    """
    Produce the final answer by combining tool results.
    Mode A (template) is the default and offline-safe path.
    """
    renderer = RENDERERS.get(task_classification.task)
    if renderer:
        answer = renderer(results, query, scene)
    else:
        answer = _render_vqa(results, query)

    # Numeric grounding check - every number in the answer must be traceable to
    # a tool output (§9.6).  This catches a fluent, plausible, invented statistic.
    ok, unsupported = verify_grounded(answer, results)
    if ok:
        return FusionResult(
            answer=answer, mode="template", grounding_check="PASS",
            unverified_numbers=unverified_numbers(answer, results))

    # Fall back to a safer rendering - just concatenate what the tools actually
    # said, so no synthesised number can survive.
    safe_parts = [r.text for r in results.values()
                  if getattr(r, "text", None)]
    if safe_parts:
        answer = " ".join(safe_parts)

    return FusionResult(
        answer=answer,
        mode="fallback_concat",
        grounding_check="FAIL",
        unsupported_numbers=sorted(set(unsupported)),
        unverified_numbers=unverified_numbers(answer, results),
    )


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
