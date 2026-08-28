"""
Planner - PRD §9.4.

Rule-based planner (default, the only one used in offline evaluation).
LLM planner enhancement (PLANNER_BACKEND=vertex) is a Phase 7 addition.
"""

from __future__ import annotations

import re
from typing import Optional

from agent.plan_schema import ExecutionPlan, PlanStep
from agent.task_classifier import TaskType


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _S(i: int, tool: str, params: dict, reason: str, inputs: Optional[dict] = None) -> PlanStep:
    return PlanStep(id=f"s{i}", tool=tool, params=params, reason=reason, inputs=inputs or {})


def _index_for(query: str) -> str:
    """Guess which spectral index the query is asking about."""
    q = query.lower()
    if any(k in q for k in ("vegetation", "green", "plant", "crop", "forest", "ndvi")):
        return "NDVI"
    if any(k in q for k in ("water", "lake", "river", "flood", "ndwi")):
        return "NDWI"
    if any(k in q for k in ("built", "urban", "city", "building", "ndbi")):
        return "NDBI"
    if any(k in q for k in ("moisture", "wet", "dry", "ndmi")):
        return "NDMI"
    return "NDVI"  # safe default


def _targets_from(query: str) -> list:
    """Extract fusion targets from the query."""
    q = query.lower()
    targets = []
    if any(k in q for k in ("water", "lake", "river", "flood")):
        targets.append("water")
    if any(k in q for k in ("built", "urban", "city", "building")):
        targets.append("built_up")
    if any(k in q for k in ("vegetation", "green", "plant", "forest")):
        targets.append("vegetation")
    if any(k in q for k in ("bare", "soil", "barren")):
        targets.append("bare_soil")
    return targets or ["all"]


def _asks_direction(query: str) -> bool:
    """Does the query ask about the *direction* of change (increased/decreased)?"""
    q = query.lower()
    return any(k in q for k in ("increased", "decreased", "more", "less", "grown", "shrunk", "direction"))


def _extract_phrase(query: str) -> str:
    """Extract the target phrase for grounding from the query."""
    # Remove common grounding cue words and return what's left
    q = query.strip()
    for cue in ["highlight", "locate", "where is", "mark the", "show me the",
                "point out", "outline", "find the", "which region"]:
        q = re.sub(rf"\b{cue}\b", "", q, flags=re.IGNORECASE)
    q = re.sub(r"[?.,!]", "", q).strip()
    return q or query.strip()


def _resequence(steps: list) -> list:
    """Re-number step IDs to s1..sN in execution order."""
    for i, s in enumerate(steps, 1):
        old_id = s.id
        new_id = f"s{i}"
        # Update references in later steps
        for later in steps[i:]:
            for key, val in list(later.inputs.items()):
                if val.startswith(f"{old_id}."):
                    later.inputs[key] = val.replace(f"{old_id}.", f"{new_id}.", 1)
        s.id = new_id
    return steps


# ---------------------------------------------------------------------------
# Rule-based planner - PRD §9.4
# ---------------------------------------------------------------------------

def plan_rules(task: TaskType, query: str, scene) -> ExecutionPlan:
    """
    Deterministic rule-based planner.
    This is the primary planner and the only one used in offline evaluation.
    """

    if task == TaskType.SINGLE_VQA:
        steps = [_S(1, "rs_vqa", {"question": query}, "Direct VQA on the supplied image")]
        # If the question asks about area or extent, add deterministic measurement
        if any(k in query.lower() for k in ("how much", "area", "extent", "percentage", "coverage")):
            idx = _index_for(query)
            steps += [
                _S(2, "spectral_index", {"index": idx},
                   "Quantify extent with a deterministic spectral index"),
                _S(3, "geo_stats", {"mask_ref": "s2.artifacts.mask", "units": "ha"},
                   "Convert the index mask to area",
                   {"mask_ref": "s2.artifacts.mask"}),
            ]

    elif task == TaskType.SINGLE_CAPTION:
        steps = [
            _S(1, "rs_classify", {}, "Land-cover probabilities as factual anchor"),
            _S(2, "rs_caption", {"detail": "standard"}, "Generate scene description"),
        ]

    elif task == TaskType.SINGLE_GROUNDING:
        phrase = _extract_phrase(query)
        steps = [
            _S(1, "rs_ground", {"phrase": phrase},
               "Locate the region referred to in the query"),
            _S(2, "geo_stats", {"mask_ref": "s1.artifacts.boxes", "units": "ha"},
               "Measure the located region",
               {"mask_ref": "s1.artifacts.boxes"}),
        ]

    elif task in (TaskType.CHANGE_DESCRIPTION, TaskType.CHANGE_MAP):
        steps = [
            _S(1, "coreg_check", {},
               "Confirm the pair is aligned before differencing"),
            _S(2, "change_detect", {},
               "Produce the binary change map"),
            _S(3, "geo_stats", {"mask_ref": "s2.artifacts.mask", "units": "ha"},
               "Quantify changed area",
               {"mask_ref": "s2.artifacts.mask"}),
            _S(4, "change_describe", {},
               "Describe the change, anchored on measured statistics"),
        ]

    elif task == TaskType.CHANGE_VQA:
        steps = [
            _S(1, "change_detect", {},
               "Measure change to anchor the answer"),
            _S(2, "change_vqa", {"question": query},
               "Answer the temporal question"),
        ]
        if _asks_direction(query):
            steps.insert(1, _S(0, "spectral_index", {"index": "NDBI"},
                               "Signed built-up index difference gives the direction of change"))
            steps = _resequence(steps)

    elif task == TaskType.CROSS_MODAL_ANALYSIS:
        targets = _targets_from(query)
        steps = [
            _S(1, "coreg_check", {},
               "Confirm optical and SAR are co-registered"),
            _S(2, "sar_optical_fuse", {"targets": targets},
               "Joint optical-SAR extraction with inter-sensor agreement"),
            _S(3, "geo_stats", {"mask_ref": "s2.artifacts.water_mask", "units": "ha"},
               "Quantify agreed water extent",
               {"mask_ref": "s2.artifacts.water_mask"}),
            _S(4, "rs_vqa", {"question": query},
               "Phrase the finding as an answer to the user's question"),
        ]

    elif task == TaskType.LAND_COVER_ANALYSIS:
        steps = [
            _S(1, "rs_classify", {},
               "19-class land-cover probabilities"),
            _S(2, "rs_caption", {"detail": "detailed"},
               "Narrative land-cover description"),
        ]

    else:
        # Fallback: simple VQA
        steps = [_S(1, "rs_vqa", {"question": query}, "Fallback VQA")]

    return ExecutionPlan(task=task, steps=steps, backend="rules")


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def make_plan(task_classification, query: str, scene) -> ExecutionPlan:
    """
    Produce an execution plan for the given task.
    Currently uses the rule-based planner only.
    LLM planner (PLANNER_BACKEND=vertex) is a Phase 7 enhancement.
    """
    return plan_rules(task_classification.task, query, scene)
