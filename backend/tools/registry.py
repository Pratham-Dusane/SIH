"""
Tool registry — PRD §8.2.

Provides a decorator-based registration mechanism and a manifest function
that is both injected into the planner prompt AND exposed at GET /api/tools.
"""

from __future__ import annotations

from typing import Dict, List

from tools.base import Tool


# ---------------------------------------------------------------------------
# Global registry — populated at import time via the @register decorator.
# ---------------------------------------------------------------------------
REGISTRY: Dict[str, Tool] = {}


def register(tool_cls):
    """Class decorator: instantiate the tool and add it to the global registry."""
    t = tool_cls()
    REGISTRY[t.name] = t
    return tool_cls


def registry_manifest() -> List[dict]:
    """Serialised for the planner prompt AND exposed at GET /api/tools."""
    return [
        {
            "name": t.name,
            "description": t.description,
            "accepts": t.accepts,
            "required_modalities": t.required_modalities,
            "produces": t.produces,
            "params_schema": t.params_model.model_json_schema(),
            "offline_capable": t.offline_capable,
        }
        for t in REGISTRY.values()
    ]
