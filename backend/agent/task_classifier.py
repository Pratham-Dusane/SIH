"""
Task classifier — PRD §9.2.

Two-stage classification: rules first, model second.
The input configuration already eliminates most of the space.
"""

from __future__ import annotations

from enum import Enum
from typing import List

from pydantic import BaseModel

from core.config import settings


class TaskType(str, Enum):
    SINGLE_VQA           = "SINGLE_IMAGE_VQA"
    SINGLE_CAPTION       = "SINGLE_IMAGE_CAPTIONING"
    SINGLE_GROUNDING     = "TEXT_GUIDED_GROUNDING"
    CHANGE_DESCRIPTION   = "CHANGE_DESCRIPTION"
    CHANGE_VQA           = "CHANGE_VQA"
    CHANGE_MAP           = "CHANGE_MAP_GENERATION"
    CROSS_MODAL_ANALYSIS = "CROSS_MODAL_ANALYSIS"
    LAND_COVER_ANALYSIS  = "LAND_COVER_ANALYSIS"
    UNSUPPORTED          = "UNSUPPORTED"


class TaskClassification(BaseModel):
    task: TaskType
    confidence: float
    evidence: List[str]


# ---------------------------------------------------------------------------
# Rule cues — PRD §9.2
# ---------------------------------------------------------------------------
GROUNDING_CUES = (
    "highlight", "locate", "where is", "mark the", "show me the",
    "point out", "outline", "find the", "which region",
)
CHANGE_CUES = (
    "change", "changed", "increase", "decrease", "before", "after",
    "between these", "over time", "grown", "expanded", "new",
)
CAPTION_CUES = (
    "describe", "caption", "what do you see", "summarise", "overview",
)
CROSS_CUES = (
    "both", "optical and sar", "sar and optical", "using both",
    "combine", "together", "complementary", "fuse",
)
LANDCOVER_CUES = (
    "land cover", "landcover", "land use", "landuse", "classify",
    "classification", "what types of land",
)
QUESTION_STARTERS = ("has ", "did ", "is ", "are ", "how many", "what is", "which")


def _rule_confidence(q: str, task: TaskType) -> float:
    """Heuristic confidence of the rule classification."""
    if task == TaskType.UNSUPPORTED:
        return 0.0
    # Higher confidence if multiple cue categories match
    cue_count = 0
    for cues in [GROUNDING_CUES, CHANGE_CUES, CAPTION_CUES, CROSS_CUES, LANDCOVER_CUES]:
        if any(c in q for c in cues):
            cue_count += 1
    # Penalty if multiple categories match (ambiguous)
    if cue_count > 1:
        return 0.55
    elif cue_count == 1:
        return 0.85
    else:
        # Fell through to defaults
        return 0.65


def classify_task(query: str, scene) -> TaskClassification:
    """
    Classify the user's query into a TaskType.
    Rules first — the input configuration constrains the space before the text
    is even read.  LLM fallback for low-confidence cases.
    """
    q = query.lower().strip()
    cfg = scene.input_config
    evidence = []

    if cfg == "BI_TEMPORAL":
        if any(c in q for c in ("map", "where exactly", "show the change area")):
            t = TaskType.CHANGE_MAP
        elif q.endswith("?") or any(q.startswith(w) for w in QUESTION_STARTERS):
            t = TaskType.CHANGE_VQA
        else:
            t = TaskType.CHANGE_DESCRIPTION
        evidence.append(f"bi-temporal input restricts task space; matched {t.value}")

    elif cfg == "CROSS_MODAL":
        if any(c in q for c in LANDCOVER_CUES):
            t = TaskType.LAND_COVER_ANALYSIS
        elif any(c in q for c in CROSS_CUES) or not q.endswith("?"):
            t = TaskType.CROSS_MODAL_ANALYSIS
        else:
            t = TaskType.SINGLE_VQA
        evidence.append("cross-modal pair supplied")

    else:  # SINGLE
        if any(c in q for c in GROUNDING_CUES):
            t = TaskType.SINGLE_GROUNDING
        elif any(c in q for c in LANDCOVER_CUES):
            t = TaskType.LAND_COVER_ANALYSIS
        elif any(c in q for c in CAPTION_CUES):
            t = TaskType.SINGLE_CAPTION
        elif q.endswith("?"):
            t = TaskType.SINGLE_VQA
        else:
            t = TaskType.SINGLE_CAPTION

    conf = _rule_confidence(q, t)

    # PRD: if confidence < 0.6 and PLANNER_BACKEND != "local", use LLM classifier
    # (skipped here — LLM classifier is a Phase 7 enhancement; rule-based is the
    # primary and offline-safe path)
    if conf < 0.6 and settings.PLANNER_BACKEND != "local":
        evidence.append(f"rule confidence {conf:.2f} below threshold; LLM fallback not yet wired")

    return TaskClassification(task=t, confidence=conf, evidence=evidence)
