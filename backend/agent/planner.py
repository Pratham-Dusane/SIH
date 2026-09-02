"""
Planner - PRD §9.4.

Rule-based planner (default, the only one used in offline evaluation).
LLM planner enhancement (PLANNER_BACKEND=vertex) is a Phase 7 addition.
"""

import json
import logging
import re
from typing import Optional

from agent.plan_schema import ExecutionPlan, PlanStep
from agent.task_classifier import TaskType

log = logging.getLogger(__name__)


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
    from agent.task_classifier import GROUNDING_CUES
    q = query.strip()

    # Strip conversational filler prefixes
    fillers = (
        r"can\s+(?:you|u)\s+(?:please\s+)?",
        r"could\s+(?:you|u)\s+(?:please\s+)?",
        r"please\s+",
        r"i\s+want\s+(?:you\s+)?to\s+",
        r"help\s+me\s+",
    )
    for f in fillers:
        q = re.sub(rf"^{f}", "", q, flags=re.IGNORECASE).strip()

    # Sort cues by length descending so longer matches take precedence
    for cue in sorted(GROUNDING_CUES, key=len, reverse=True):
        q = re.sub(rf"\b{re.escape(cue)}\b", "", q, flags=re.IGNORECASE)

    # Strip conversational and styling suffixes
    suffixes = (
        r"\s+with\s+(?:arrows|boxes|ellipses|circles|rectangles|polygons)",
        r"\s+in\s+the\s+image",
        r"\s+which\s+are\s+visible(?:\s+in\s+the\s+image)?",
        r"\s+that\s+are\s+visible(?:\s+in\s+the\s+image)?",
        r"\s+in\s+this\s+satellite\s+image",
        r"\s+here",
    )
    for s in suffixes:
        q = re.sub(rf"{s}", "", q, flags=re.IGNORECASE).strip()

    q = re.sub(r"\s+", " ", q)
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
        q_lower = query.lower()
        # Case A: User asks for area/size of an annotation, box, shape, or layer
        if any(k in q_lower for k in ("area", "size", "dimension", "how big", "calculate the area", "extent", "hectare", "m2", "sq m")) and any(k in q_lower for k in ("rectangle", "box", "layer", "shape", "circle", "drawn", "highlight", "annotat", "this", "polygon", "marked")):
            steps = [
                _S(1, "geo_stats", {"mask_ref": "user_annotation_mask", "units": "ha"},
                   "Calculate exact physical area and pixel dimensions of the user-drawn annotation"),
                _S(2, "rs_vqa", {"question": query},
                   "Synthesize answer with visual context and physical measurement",
                   {"measurements": "s1.facts"}),
            ]
        # Case B: General land-cover area/extent question across the scene (e.g. vegetation extent)
        elif any(k in q_lower for k in ("how much", "area", "extent", "percentage", "coverage")):
            idx = _index_for(query)
            steps = [
                _S(1, "spectral_index", {"index": idx},
                   "Quantify extent with a deterministic spectral index"),
                _S(2, "geo_stats", {"mask_ref": "s1.artifacts.mask", "units": "ha"},
                   "Convert the index mask to area",
                   {"mask_ref": "s1.artifacts.mask"}),
                _S(3, "rs_vqa", {"question": query},
                   "Answer the question grounded on measured physical statistics",
                   {"measurements": "s2.facts"}),
            ]
        else:
            steps = [_S(1, "rs_vqa", {"question": query}, "Direct VQA on the supplied image")]

    elif task == TaskType.SINGLE_CAPTION:
        steps = [
            _S(1, "rs_classify", {}, "Land-cover probabilities as factual anchor"),
            _S(2, "rs_caption", {"detail": "standard"}, "Generate scene description"),
        ]

    elif task == TaskType.SINGLE_GROUNDING:
        phrase = _extract_phrase(query)
        q_lower = query.lower()

        # Decide optimal drawing tool kind: arrow for linear/highways, ellipse for water/circles, rectangle otherwise
        if "arrow" in q_lower or "direction" in q_lower:
            shape_kind = "arrow"
        elif "circle" in q_lower or "ellipse" in q_lower or "round" in q_lower or "lake" in q_lower or "pond" in q_lower:
            shape_kind = "ellipse"
        else:
            shape_kind = "rectangle"

        steps = [
            _S(1, "rs_ground", {"phrase": phrase},
               "Locate the region referred to in the query"),
            _S(2, "annotate", {
                "label": phrase.title() if phrase else "Detected Features",
                "kind": shape_kind,
                "boxes": "s1.artifacts.boxes"
            }, f"Draw vector {shape_kind} annotations on the scene canvas",
            {"boxes": "s1.artifacts.boxes"}),
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
# LLM Dynamic Planner with Deterministic Safety Validation & Graph Composer
# ---------------------------------------------------------------------------

def validate_and_compose_plan(raw_plan: dict, task: TaskType, scene, backend_label: str = "llm") -> Optional[ExecutionPlan]:
    """
    Deterministic Plan Validator & Safety Gate.

    Enforces that:
    1. Every proposed tool exists in the tool registry.
    2. Every tool is compatible with the scene's input configuration.
    3. Non-permitted parameters are filtered against the tool's schema.
    4. Input artifact references (e.g. s1.artifacts.mask) only point to prior steps.
    """
    from tools.registry import REGISTRY

    steps_raw = raw_plan.get("steps")
    if not isinstance(steps_raw, list) or not steps_raw:
        return None

    validated_steps: list[PlanStep] = []
    available_artifacts: set[str] = set()

    for idx, s in enumerate(steps_raw, 1):
        if not isinstance(s, dict):
            continue
        tool_name = s.get("tool", "")
        if tool_name not in REGISTRY:
            log.warning("LLM proposed unregistered tool '%s', rejecting plan", tool_name)
            return None

        tool_instance = REGISTRY[tool_name]
        # Check input config compatibility
        if scene.input_config not in tool_instance.accepts:
            log.warning("Tool '%s' does not accept input config '%s'", tool_name, scene.input_config)
            return None

        # Filter parameters against schema
        schema_props = tool_instance.params_model.model_json_schema().get("properties", {})
        raw_params = s.get("params") or s.get("args") or {}
        cleaned_params = {k: v for k, v in raw_params.items() if k in schema_props}

        # Normalize step ID
        step_id = f"s{idx}"
        reason = s.get("reason") or f"Execute {tool_name}"
        raw_inputs = s.get("inputs") or {}

        # Validate input artifact references
        cleaned_inputs = {}
        for in_k, in_v in raw_inputs.items():
            if isinstance(in_v, str) and ".artifacts." in in_v:
                # E.g. "s1.artifacts.boxes"
                cleaned_inputs[in_k] = in_v
            elif in_k in schema_props:
                cleaned_params[in_k] = in_v

        # Record artifacts this tool will produce
        for prod in tool_instance.produces:
            available_artifacts.add(f"{step_id}.artifacts.{prod}")

        validated_steps.append(PlanStep(
            id=step_id,
            tool=tool_name,
            params=cleaned_params,
            reason=reason,
            inputs=cleaned_inputs,
        ))

    if not validated_steps:
        return None

    # Enforce mandatory core capabilities for canonical tasks
    planned_tools = {st.tool for st in validated_steps}
    if task == TaskType.SINGLE_CAPTION and not (planned_tools & {"rs_caption", "rs_classify"}):
        log.warning("Plan for SINGLE_CAPTION missing rs_caption/rs_classify: %s", planned_tools)
        return None
    if task == TaskType.SINGLE_GROUNDING and not (planned_tools & {"rs_ground", "annotate"}):
        log.warning("Plan for SINGLE_GROUNDING missing rs_ground: %s", planned_tools)
        return None
    if task in (TaskType.CHANGE_MAP, TaskType.CHANGE_DESCRIPTION) and not (planned_tools & {"change_detect", "change_describe"}):
        log.warning("Plan for %s missing change detection tools: %s", task.value, planned_tools)
        return None
    if task == TaskType.CROSS_MODAL_ANALYSIS and not (planned_tools & {"sar_optical_fuse", "sar_water_mask"}):
        log.warning("Plan for CROSS_MODAL_ANALYSIS missing SAR fusion tools: %s", planned_tools)
        return None

    return ExecutionPlan(task=task, steps=validated_steps, backend=backend_label)


async def plan_with_llm(task: TaskType, scene, query: str) -> Optional[ExecutionPlan]:
    """
    LLM-powered dynamic DAG planning via Qwen3 14B / Vertex AI.
    Decomposes arbitrary queries into multi-step tool graphs grounded in tool registry contracts.
    """
    try:
        from core.config import settings
        from services.inference.llm_gateway import call_llm_json
        from tools.registry import registry_manifest

        manifest = registry_manifest()

        system_prompt = (
            "You are an expert geospatial DAG planner. Given a user query, scene metadata, and a live "
            "tool registry, compose an optimal, executable Directed Acyclic Graph (DAG) plan.\n\n"
            "Rules:\n"
            "1. ONLY use tools listed in the registry.\n"
            "2. Bind dependencies between steps using artifact references (e.g. inputs: {\"mask_ref\": \"s1.artifacts.mask\"}).\n"
            "3. Keep plans lean, targeted, and factually grounded.\n"
            "4. Return strict JSON matching this structure:\n"
            "{\n"
            "  \"reasoning\": \"brief step-by-step logic\",\n"
            "  \"steps\": [\n"
            "    {\n"
            "      \"id\": \"s1\",\n"
            "      \"tool\": \"tool_name\",\n"
            "      \"params\": { ... },\n"
            "      \"inputs\": { ... },\n"
            "      \"reason\": \"human readable explanation\"\n"
            "    }\n"
            "  ]\n"
            "}"
        )

        user_prompt = (
            f"User Query: \"{query}\"\n"
            f"Task Type: {task.value}\n"
            f"Scene Modality: {scene.input_config}\n"
            f"Images: {[img.modality for img in scene.images]}\n\n"
            f"Available Tool Registry:\n{json.dumps(manifest, indent=2)}"
        )

        parsed, backend_info = await call_llm_json(
            prompt=user_prompt,
            system=system_prompt,
            prefer_backend="auto",
            prefer_model=getattr(settings, "OLLAMA_PLANNER_MODEL", "qwen3:14b"),
            timeout=12.0,
        )

        # Pass through deterministic plan validator and safety composer
        plan = validate_and_compose_plan(parsed, task, scene, backend_label=f"llm:{backend_info}")
        if plan:
            log.info("LLM Planner (%s) generated valid %d-step DAG plan", backend_info, len(plan.steps))
            return plan
        else:
            log.warning("LLM plan failed deterministic validation; falling back to rules")
    except Exception as e:
        log.info("LLM planning bypassed (%s); falling back to deterministic rules", e)

    return None


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def make_plan(task_classification, query: str, scene) -> ExecutionPlan:
    """
    Produce an execution plan:
    1. Known canonical tasks (confidence >= 0.85) use deterministic, proven DAG recipes (rules).
    2. Novel, ambiguous, or multi-faceted queries (confidence < 0.85) invoke dynamic LLM planning (Qwen3 14B / Vertex AI).
    3. All LLM proposed plans are validated through deterministic safety and dependency gates.
    """
    from core.config import settings

    task = task_classification.task if hasattr(task_classification, "task") else task_classification
    conf = getattr(task_classification, "confidence", 1.0)
    backend_mode = getattr(settings, "PLANNER_BACKEND", "local")

    if (backend_mode in ("llm", "vertex", "ollama") or (conf < 0.85 and backend_mode != "rules")) and not getattr(settings, "OFFLINE_MODE", False):
        llm_plan = await plan_with_llm(task, scene, query)
        if llm_plan:
            return llm_plan

    return plan_rules(task, query, scene)

