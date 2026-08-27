"""
Tool interface — PRD §8.1.

Every capability is a Tool.  The agent may only ever invoke tools; it cannot
call a model directly.  This is what makes R7/R9/R11 enforceable rather than
aspirational.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Literal, Optional, Type

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Input configuration enum value type
# ---------------------------------------------------------------------------
InputConfig = Literal["SINGLE", "CROSS_MODAL", "BI_TEMPORAL"]


# ---------------------------------------------------------------------------
# ToolParams — base for every tool's parameter model.
# extra='forbid' is the R9 enforcement point: a planner that invents a
# parameter gets a ValidationError, not silent behaviour.
# ---------------------------------------------------------------------------
class ToolParams(BaseModel):
    """Base for all tool parameter models."""
    model_config = ConfigDict(extra="forbid")


# ---------------------------------------------------------------------------
# ToolResult — returned by every tool execution.
# ---------------------------------------------------------------------------
class ToolResult(BaseModel):
    tool: str
    model_id: Optional[str] = None
    model_version: Optional[str] = None
    text: Optional[str] = None                        # human-readable finding
    facts: Dict[str, Any] = Field(default_factory=dict)  # machine-checkable values used by fusion
    artifacts: Dict[str, Any] = Field(default_factory=dict)  # {"mask": path, "boxes": [...], ...}
    confidence: float                                 # [0, 1]
    confidence_basis: str                             # how it was computed — shown in the UI
    duration_ms: int = 0
    warnings: List[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Tool — abstract base class for every capability.
# ---------------------------------------------------------------------------
class Tool(ABC):
    name: str
    description: str                                   # read by the planner — write it for an LLM
    accepts: List[InputConfig]
    required_modalities: List[str]                     # e.g. ["SAR"] or ["OPTICAL|MULTISPECTRAL","SAR"]
    params_model: Type[ToolParams]
    produces: List[str]                                # "text" | "mask" | "boxes" | "map" | "stats"
    model_id: Optional[str] = None
    offline_capable: bool = True                       # §8.2 — gate and eval harness read this

    @abstractmethod
    async def run(self, ctx: "ExecutionContext", params: ToolParams) -> ToolResult:
        ...

    def can_run(self, scene) -> tuple[bool, str]:
        """Check whether this tool is compatible with the given scene."""
        if scene.input_config not in self.accepts:
            return False, f"{self.name} requires {self.accepts}, scene is {scene.input_config}"
        for req in self.required_modalities:
            options = req.split("|")
            if not any(m in options for m in scene.modalities):
                return False, f"{self.name} requires a {req} image; scene has {scene.modalities}"
        return True, ""
