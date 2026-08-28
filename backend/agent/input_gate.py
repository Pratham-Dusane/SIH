"""
Input gate - PRD §9.3 (R8).

Validates that the classified task is achievable with the given scene.
Refusals are structured, never a generic apology.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel

from agent.task_classifier import TaskClassification, TaskType


class Problem(BaseModel):
    code: str
    detail: str
    remedy: str


class GateResult(BaseModel):
    ok: bool
    problems: List[Problem] = []
    warnings: List[str] = []
    # Live backend availability at gate time - PRD §7.2.  A failed init_gee()
    # or a missing VLM key surfaces here as a missing capability, not a crash.
    capabilities: dict = {}


# ---------------------------------------------------------------------------
# Remedies - user-facing instructions for how to fix the problem
# ---------------------------------------------------------------------------
REMEDY = {
    TaskType.SINGLE_VQA:           "Upload a single image and ask a question about it.",
    TaskType.SINGLE_CAPTION:       "Upload a single image for captioning.",
    TaskType.SINGLE_GROUNDING:     "Upload a single image and describe the region to locate.",
    TaskType.CHANGE_DESCRIPTION:   "Upload a bi-temporal pair (two images of the same area at different times).",
    TaskType.CHANGE_VQA:           "Upload a bi-temporal pair and ask a question about the change.",
    TaskType.CHANGE_MAP:           "Upload a bi-temporal pair for change map generation.",
    TaskType.CROSS_MODAL_ANALYSIS: "Upload one optical and one SAR image of the same area.",
    TaskType.LAND_COVER_ANALYSIS:  "Upload a single image or cross-modal pair for land cover analysis.",
    TaskType.UNSUPPORTED:          "Rephrase your query or select a different analysis type.",
}


# ---------------------------------------------------------------------------
# Task requirements matrix - PRD §9.3
# ---------------------------------------------------------------------------
TASK_REQUIREMENTS = {
    TaskType.SINGLE_VQA:           {"configs": ["SINGLE", "CROSS_MODAL", "BI_TEMPORAL"], "modalities": []},
    TaskType.SINGLE_CAPTION:       {"configs": ["SINGLE"], "modalities": []},
    TaskType.SINGLE_GROUNDING:     {"configs": ["SINGLE", "CROSS_MODAL"], "modalities": []},
    TaskType.CHANGE_DESCRIPTION:   {"configs": ["BI_TEMPORAL"], "modalities": []},
    TaskType.CHANGE_VQA:           {"configs": ["BI_TEMPORAL"], "modalities": []},
    TaskType.CHANGE_MAP:           {"configs": ["BI_TEMPORAL"], "modalities": []},
    TaskType.CROSS_MODAL_ANALYSIS: {"configs": ["CROSS_MODAL"], "modalities": ["SAR", "OPTICAL|MULTISPECTRAL"]},
    TaskType.LAND_COVER_ANALYSIS:  {"configs": ["SINGLE", "CROSS_MODAL"], "modalities": []},
}


# ---------------------------------------------------------------------------
# Backend requirements per task - PRD §7.2.
#
# `required`: no other tool can serve this task, so an unavailable backend is a
#             hard refusal with a remedy.
# `optional`: the task also has a deterministic path, so an unavailable backend
#             is a warning and the answer degrades rather than being refused.
# ---------------------------------------------------------------------------
TASK_BACKENDS = {
    TaskType.SINGLE_VQA:           {"required": ["V1"], "optional": []},
    TaskType.SINGLE_CAPTION:       {"required": ["V1"], "optional": []},
    TaskType.SINGLE_GROUNDING:     {"required": ["V1"], "optional": []},
    TaskType.CHANGE_DESCRIPTION:   {"required": ["V1"], "optional": ["G2"]},
    TaskType.CHANGE_VQA:           {"required": ["V1"], "optional": ["G2"]},
    TaskType.CHANGE_MAP:           {"required": ["G2"], "optional": []},
    TaskType.CROSS_MODAL_ANALYSIS: {"required": [], "optional": []},
    TaskType.LAND_COVER_ANALYSIS:  {"required": [], "optional": ["G1"]},
}

BACKEND_LABELS = {
    "V1": "the hosted VLM gateway",
    "G1": "Google Earth Engine (Dynamic World / ESA WorldCover)",
    "G2": "Google Earth Engine (Sentinel-2 change differencing)",
}

BACKEND_REMEDY = {
    "V1": ("Set VLM_BACKEND and its credentials - vertex needs VERTEX_PROJECT and a "
           "service-account key (it reuses GEE_PROJECT / GEE_KEY_PATH by default); "
           "gemini/gpt4v/claude need GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY. "
           "Or ask a question the deterministic tools can measure (water extent, "
           "vegetation index, built-up area, alignment)."),
    "G1": ("Configure GEE_SERVICE_ACCOUNT, GEE_KEY_PATH and GEE_PROJECT, or use "
           "spectral_index on the uploaded bands instead of a catalog land-cover product."),
    "G2": ("Configure GEE_SERVICE_ACCOUNT, GEE_KEY_PATH and GEE_PROJECT - change mapping "
           "has no offline equivalent in this build."),
}


def backend_capabilities() -> dict:
    """
    Live availability of every hosted backend.  Never raises: a missing key or a
    failed ee.Initialize() is reported, not thrown (§7.2).
    """
    from services.inference.vlm_gateway import vlm_available

    caps = {}
    vlm_ok, vlm_reason = vlm_available()
    caps["V1"] = {"available": vlm_ok, "reason": vlm_reason,
                  "label": BACKEND_LABELS["V1"], "offline_capable": False}

    try:
        from core.gee import gee_available
        gee_ok, gee_reason = gee_available()
    except Exception as e:  # noqa: BLE001 - availability probing must never crash the gate
        gee_ok, gee_reason = False, f"{type(e).__name__}: {e}"

    for bid in ("G1", "G2"):
        caps[bid] = {"available": gee_ok, "reason": gee_reason,
                     "label": BACKEND_LABELS[bid], "offline_capable": False}
    return caps


def input_gate(tc: TaskClassification, scene) -> GateResult:
    """
    Check whether the classified task is achievable with the given scene
    *and* with the backends currently available.
    Returns a structured result with problems and remedies.
    """
    caps = backend_capabilities()

    if tc.task == TaskType.UNSUPPORTED:
        return GateResult(
            ok=False,
            problems=[Problem(
                code="UNSUPPORTED_TASK",
                detail="The query could not be classified into a supported task type.",
                remedy=REMEDY[TaskType.UNSUPPORTED],
            )],
            capabilities=caps,
        )

    req = TASK_REQUIREMENTS.get(tc.task)
    if req is None:
        return GateResult(ok=True, problems=[], warnings=[], capabilities=caps)

    problems: List[Problem] = []
    capability_warnings: List[str] = []

    # Backend availability - §7.2.  A missing hosted backend is a missing
    # capability with a remedy, never a crash and never a silent empty answer.
    backends = TASK_BACKENDS.get(tc.task, {"required": [], "optional": []})
    for bid in backends["required"]:
        cap = caps.get(bid, {})
        if not cap.get("available"):
            problems.append(Problem(
                code="MISSING_CAPABILITY",
                detail=(
                    f"'{tc.task.value}' can only be served by {cap.get('label', bid)} "
                    f"(backend {bid}), which is unavailable: {cap.get('reason', 'unknown')}"
                ),
                remedy=BACKEND_REMEDY.get(bid, "Configure this backend and retry."),
            ))
    for bid in backends["optional"]:
        cap = caps.get(bid, {})
        if not cap.get("available"):
            capability_warnings.append(
                f"{cap.get('label', bid)} (backend {bid}) is unavailable "
                f"({cap.get('reason', 'unknown')}) - this answer will fall back to the "
                "deterministic tools and will be less specific."
            )

    # Check input configuration
    if scene.input_config not in req["configs"]:
        problems.append(Problem(
            code="WRONG_INPUT_CONFIG",
            detail=(
                f"'{tc.task.value}' needs {req['configs']}, "
                f"you supplied {scene.input_config}"
            ),
            remedy=REMEDY.get(tc.task, "Upload the correct image configuration."),
        ))

    # Check modality requirements
    for need in req["modalities"]:
        options = need.split("|")
        if not any(m in options for m in scene.modalities):
            problems.append(Problem(
                code="MISSING_MODALITY",
                detail=(
                    f"This task needs a {need} image; "
                    f"the scene contains {scene.modalities}"
                ),
                remedy="Upload the co-registered SAR image for this area.",
            ))

    # Check compatibility verdict
    if hasattr(scene, "compatibility") and scene.compatibility:
        if scene.compatibility.verdict == "FAIL":
            fail_details = "; ".join(
                c.detail for c in scene.compatibility.checks
                if c.status == "FAIL"
            )
            problems.append(Problem(
                code="INCOMPATIBLE_INPUTS",
                detail=fail_details or "Compatibility check failed",
                remedy="Re-upload images covering the same area, or co-register them before upload.",
            ))

    # Check co-registration for change tasks
    if tc.task in (TaskType.CHANGE_MAP, TaskType.CHANGE_DESCRIPTION):
        coreg = getattr(scene, "coreg_shift_px", None)
        if coreg is not None and coreg > 8.0:
            problems.append(Problem(
                code="POOR_CO_REGISTRATION",
                detail=(
                    f"Misregistration of {coreg:.1f} px would be indistinguishable "
                    "from real change"
                ),
                remedy="Co-register the pair to within ~2 px.",
            ))

    # Collect warnings from compatibility checks
    warnings: List[str] = []
    if hasattr(scene, "compatibility") and scene.compatibility:
        warnings = [
            c.detail for c in scene.compatibility.checks
            if c.status == "WARN"
        ]
    warnings += capability_warnings

    return GateResult(ok=not problems, problems=problems, warnings=warnings,
                      capabilities=caps)
