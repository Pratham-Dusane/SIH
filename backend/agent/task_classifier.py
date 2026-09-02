"""
Task classifier - PRD §9.2.

Two-stage classification: rules first, model second.
The input configuration already eliminates most of the space.
"""

from __future__ import annotations

from enum import Enum
import logging
from typing import List

from pydantic import BaseModel

from core.config import settings

log = logging.getLogger(__name__)


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
# Rule cues - PRD §9.2
# Domain-specific keyword and phrase cues for Remote Sensing & Earth Observation.
# ---------------------------------------------------------------------------
GROUNDING_CUES = (
    "map out", "map the", "map out the", "mark out", "highlight", "locate",
    "where is", "where are", "mark the", "show me the", "point out", "outline",
    "find the", "which region", "pinpoint", "detect the location", "draw a box",
    "bounding box", "identify the area", "spot the", "demarcate", "isolate the",
    "find all", "track down", "where can i find", "circle the", "bound the",
    "delineate", "geolocate", "localize", "find the position of", "indicate where",
    "trace the boundary", "box the", "find the coordinates of", "show region of",
    "mark region", "spot where", "detect where", "where does", "display the location",
    "find target", "detect target", "segment the", "identify location of",
    "target location", "where in the image", "show the boundary of",
    "delineate the", "find the extent of", "locate the region",
    "show the bounding box", "where is situated", "find the footprint of",
    "mark every", "box all", "pinpoint the location",
)

CHANGE_CUES = (
    "change", "changed", "increase", "decrease", "before", "after",
    "between these", "over time", "grown", "expanded", "new", "difference",
    "differencing", "loss", "gain", "expansion", "reduction", "deforestation",
    "urban sprawl", "encroachment", "disappearance", "appearance", "construction",
    "destruction", "development", "flood extent change", "vegetation loss",
    "vegetation gain", "built-up expansion", "temporal change", "multi-temporal",
    "time series", "comparison between", "compare dates", "delta", "shifted",
    "evolved", "transformation", "degraded", "rehabilitated", "altered",
    "transitioned", "pre and post", "t1 and t2", "earlier vs later",
    "before and after", "what changed", "how did it change", "land cover change",
    "forest loss", "water body shrinkage", "lake expansion", "damage assessment",
    "growth over time", "new structures", "demolished",
)

CAPTION_CUES = (
    "describe", "caption", "what do you see", "summarise", "summarize", "overview",
    "scene description", "tell me about this image", "tell me about the scene",
    "give a summary", "general description", "image overview", "brief summary",
    "detailed description", "scene interpretation", "visual summary",
    "explain the image", "what does this satellite image show",
    "what does this image depict", "give an overview", "comprehensive description",
    "characterize the scene", "describe the landscape", "describe the terrain",
    "describe the area", "what is shown in the image", "visual interpretation",
    "remote sensing interpretation", "narrative description", "scene report",
    "break down this image", "analyze the scene", "scene context",
    "give me a caption", "walk me through the scene", "landscape overview",
    "describe land features", "overall appearance", "what is visible in the scene",
    "provide a caption", "general summary", "satellite photo overview",
    "aerial photo description", "describe geography", "describe surroundings",
    "describe environment", "scene analysis", "broad description",
    "overall character of the area", "give a detailed report of this scene",
)

CROSS_CUES = (
    "both", "optical and sar", "sar and optical", "using both", "combine",
    "together", "complementary", "fuse", "fusion", "joint analysis",
    "multi-modal", "multimodal", "sensor fusion", "cross-sensor",
    "radar and optical", "optical and radar", "sentinel-1 and sentinel-2",
    "sentinel-2 and sentinel-1", "s1 and s2", "joint optical-sar",
    "fused imagery", "multi-sensor", "cross-modal", "radar backscatter and reflectance",
    "vv/vh and rgb", "optical and radar agreement", "inter-sensor agreement",
    "polarimetric and spectral", "sar structure with optical", "dual-sensor",
    "complementary sensors", "combined optical and sar", "fuse radar with optical",
    "fused detection", "all-weather sar with optical",
    "optical cloud penetration with sar", "synergy between optical and sar",
    "cross-modal verification", "joint extraction", "cross-platform analysis",
    "fused land cover", "cross-modality", "multi-source fusion",
    "combine s1 and s2", "corroborate with sar", "validate with radar",
    "cross-reference optical with sar", "fused water mask", "sar-optical composite",
    "joint reflectance and backscatter", "synergistic observation",
)

LANDCOVER_CUES = (
    "land cover", "landcover", "land use", "landuse", "classify",
    "classification", "what types of land", "lulc", "dynamic world",
    "worldcover", "class fractions", "land cover proportions", "land categories",
    "surface cover", "biome type", "dominant land class", "built vs vegetation",
    "cropland vs forest", "land distribution", "categorical breakdown",
    "land cover mapping", "thematic map", "land cover baseline",
    "terrain categorization", "surface classification", "land cover distribution",
    "percentage of built-up", "percentage of trees", "percentage of water",
    "fraction of land types", "land zoning", "ground cover",
    "vegetation vs urban", "land cover statistics", "land use breakdown",
    "surface type breakdown", "land classification summary",
    "dynamic world fractions", "esa worldcover classes", "land cover percentages",
    "land cover composition", "vegetation fraction", "impervious surface fraction",
    "bare ground fraction", "cropland fraction", "shrubland fraction",
    "water surface fraction", "dominant surface type", "land categorization",
    "land cover partition", "proportions of ground classes",
)

QUESTION_STARTERS = (
    "has ", "did ", "is ", "are ", "how many", "what ", "what is", "what are", "which ",
    "can you", "where ", "where is", "where are", "does ", "do ", "tell me if", "why ",
    "how ", "when ", "is there", "are there", "can i see", "could there be",
    "will there be", "was there", "were there", "how much", "how large",
    "what type of", "what kind of", "what proportion", "how dense", "how wide",
    "what color", "what colour", "is that a", "are those", "how long",
    "what feature", "what structures", "who ", "can we identify",
    "is it possible to see", "do you observe", "are any", "is the region",
    "does the scene contain", "is there any evidence of", "what percentage",
    "what fraction", "how deep", "is it safe to say", "can you detect",
    "what caused", "which sector", "how high", "would you say",
)


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
    Rules first - the input configuration constrains the space before the text
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
        # Questions inquiring about specific drawn shapes / annotations / visual content
        if (q.endswith("?") or any(q.startswith(w) for w in QUESTION_STARTERS)) and any(c in q for c in ("inside", "what is this", "what is in", "what does", "point to", "pointed", "in this box", "in this circle", "in this shape", "in the marked", "in the drawn", "what is here")):
            t = TaskType.SINGLE_VQA
        elif any(c in q for c in GROUNDING_CUES):
            t = TaskType.SINGLE_GROUNDING
        elif any(c in q for c in LANDCOVER_CUES):
            t = TaskType.LAND_COVER_ANALYSIS
        elif any(c in q for c in CAPTION_CUES):
            t = TaskType.SINGLE_CAPTION
        elif q.endswith("?") or any(q.startswith(w) for w in QUESTION_STARTERS):
            t = TaskType.SINGLE_VQA
        else:
            t = TaskType.SINGLE_CAPTION

    conf = _rule_confidence(q, t)

    return TaskClassification(task=t, confidence=conf, evidence=evidence)


async def classify_task_async(query: str, scene) -> TaskClassification:
    """
    Asynchronous Task Classifier:
    1. Evaluates fast deterministic rules (<1ms).
    2. If confidence >= 0.85, returns immediate rule result.
    3. If confidence < 0.85 (novel/ambiguous query), delegates to lightweight LLM classifier (Phi-3 Mini / Vertex).
    """
    rule_res = classify_task(query, scene)
    if rule_res.confidence >= 0.85:
        return rule_res

    # Try LLM classification fallback for ambiguous queries
    try:
        from services.inference.llm_gateway import call_llm_json

        system_prompt = (
            "You are an expert geospatial task classifier. Given a user query and scene configuration, "
            "classify the query into exactly ONE of the following valid TaskType enum values:\n"
            "- SINGLE_VQA: Answering questions about features/objects in a single satellite image\n"
            "- SINGLE_CAPTION: General description or overview of a single image\n"
            "- SINGLE_GROUNDING: Locating, detecting, mapping, or drawing boxes/arrows around specific objects\n"
            "- LAND_COVER_ANALYSIS: Analyzing vegetation, water, crops, urban land-use or spectral indices\n"
            "- CHANGE_DESCRIPTION: Describing changes between two temporal images\n"
            "- CHANGE_MAP: Generating change detection maps between two temporal dates\n"
            "- CHANGE_VQA: Answering questions about temporal changes\n"
            "- CROSS_MODAL_ANALYSIS: Joint optical and SAR radar feature analysis\n"
            "- UNSUPPORTED: Irrelevant or out-of-scope queries\n\n"
            "Return JSON: {\"task\": \"<TASK_TYPE>\", \"reason\": \"<brief reason>\"}"
        )

        user_prompt = f"Query: \"{query}\"\nScene Modality: {scene.input_config}"
        parsed, backend = await call_llm_json(
            prompt=user_prompt,
            system=system_prompt,
            prefer_backend="auto",
            prefer_model=getattr(settings, "OLLAMA_CLASSIFIER_MODEL", "phi3:mini"),
            timeout=5.0,
        )

        task_str = parsed.get("task", "")
        for tt in TaskType:
            if tt.value == task_str or tt.name == task_str:
                log.info("LLM Classifier (%s) resolved task: %s", backend, tt.value)
                return TaskClassification(
                    task=tt,
                    confidence=0.88,
                    evidence=[f"Classified by LLM ({backend}): {parsed.get('reason', '')}"],
                )
    except Exception as e:
        log.info("LLM classification fallback skipped (%s), using rule result", e)

    return rule_res
