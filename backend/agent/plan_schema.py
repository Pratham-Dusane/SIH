"""
Plan schema — PRD §9.4.

PlanStep and ExecutionPlan models with Pydantic validation.
Steps reference tools from the registry and declare data dependencies.
"""

from __future__ import annotations

from typing import Dict, List

from pydantic import BaseModel, Field, field_validator

from agent.task_classifier import TaskType


class PlanStep(BaseModel):
    id: str                                        # "s1"
    tool: str                                      # must exist in REGISTRY
    params: dict = {}                              # validated against tool.params_model
    inputs: Dict[str, str] = {}                    # {"mask_ref": "s1.artifacts.mask"}
    reason: str                                    # one line, shown in the trace UI


class ExecutionPlan(BaseModel):
    task: TaskType
    steps: List[PlanStep] = Field(min_length=1, max_length=8)
    backend: str = "rules"                         # "rules" | "vertex" | "local_llm"

    @field_validator("steps")
    @classmethod
    def validate_steps(cls, steps):
        """
        Validate that:
        1. Every tool name exists in the registry.
        2. Every artifact reference points to a step that appears earlier in the plan.
        """
        # Import here to avoid circular imports at module level
        from tools.registry import REGISTRY

        seen = set()
        for s in steps:
            if s.tool not in REGISTRY:
                raise ValueError(f"Unknown tool '{s.tool}'")
            for ref in s.inputs.values():
                ref_step = ref.split(".")[0]
                if ref_step not in seen:
                    raise ValueError(
                        f"Step {s.id} references an unproduced artifact {ref}"
                    )
            seen.add(s.id)
        return steps
