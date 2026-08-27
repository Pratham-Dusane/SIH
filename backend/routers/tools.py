"""
Tools router — PRD §14.

GET /api/tools          — tool registry manifest (name, schema, accepts)
GET /api/models         — backend cards (VLM provider, GEE datasets);
                          no trained-model versions exist (§7.6)
GET /api/health/models  — VLM & GEE readiness check
"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["tools"])


@router.get("/tools")
async def list_tools():
    """Return the tool registry manifest — used by the planner and for API documentation."""
    from tools.registry import registry_manifest
    return registry_manifest()


@router.get("/models")
async def list_models():
    """
    Backend cards — PRD §7.6.

    No fine-tuned models exist; these are service descriptions with live
    availability merged in.  `fine_tuning` states plainly that nothing was
    fine-tuned and that R1 is not attempted.
    """
    from core.backend_cards import fine_tuning_disclosure, load_backend_cards
    return {
        "backends": load_backend_cards(),
        "fine_tuning": fine_tuning_disclosure(),
    }


@router.get("/health/models")
async def health_models():
    """VLM & GEE readiness, plus per-tool availability derived from it."""
    from core.config import settings
    from core.gee import gee_status
    from services.inference.vlm_gateway import gateway_status
    from tools.registry import REGISTRY

    vlm = gateway_status()
    gee = gee_status()

    backend_ready = {
        "V1": vlm["configured"],
        "G1": gee["gee_initialized"],
        "G2": gee["gee_initialized"],
        None: True,
    }
    backend_reason = {
        "V1": vlm["reason"],
        "G1": gee["reason"],
        "G2": gee["reason"],
        None: "local computation",
    }

    tool_status = {}
    for name, tool in REGISTRY.items():
        available = True
        reason = "available"
        if settings.OFFLINE_MODE and not tool.offline_capable:
            available = False
            reason = "NOT_EVALUATED_OFFLINE — excluded in OFFLINE_MODE (PRD §11.5)"
        elif not tool.offline_capable:
            available = bool(backend_ready.get(tool.model_id, False))
            reason = backend_reason.get(tool.model_id, "unknown backend")
        tool_status[name] = {
            "registered": True,
            "available": available,
            "reason": reason,
            "offline_capable": tool.offline_capable,
            "model_id": tool.model_id,
        }

    unavailable = [n for n, s in tool_status.items() if not s["available"]]
    return {
        "status": "ok" if not unavailable else "degraded",
        "offline_mode": settings.OFFLINE_MODE,
        "vlm": vlm,
        "gee": gee,
        "registered_tools": len(REGISTRY),
        "unavailable_tools": unavailable,
        "tools": tool_status,
    }
