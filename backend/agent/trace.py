"""
Execution trace - PRD §9.8 (R11).

The observable artifact the problem statement says will be evaluated.
Internal reasoning text is deliberately excluded; only observable execution is recorded.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from pydantic import BaseModel, Field

from agent.task_classifier import TaskClassification


class TraceStep(BaseModel):
    id: str
    tool: str
    model: Optional[str] = None
    params_requested: dict = {}
    params_applied: dict = {}
    status: str = "PENDING"                # OK | FAILED | SKIPPED | TIMEOUT
    duration_ms: int = 0
    confidence: float = 0.0
    output_summary: Optional[str] = None
    artifacts: List[str] = Field(default_factory=list)
    facts: Dict[str, Any] = Field(default_factory=dict)
    note: Optional[str] = None
    warnings: List[str] = Field(default_factory=list)


class Confidence(BaseModel):
    value: float
    band: str                              # HIGH | MEDIUM | LOW
    basis: str
    contributions: List[Dict[str, Any]] = Field(default_factory=list)


class ExecutionTrace(BaseModel):
    trace_id: str
    scene_id: str
    query: str
    started_at: str
    finished_at: Optional[str] = None
    duration_ms: int = 0
    status: str = "IN_PROGRESS"             # IN_PROGRESS | COMPLETE | REFUSED | ERROR
    task: Optional[TaskClassification] = None
    gate: Optional[Dict[str, Any]] = None
    plan: Optional[Dict[str, Any]] = None
    steps: List[TraceStep] = Field(default_factory=list)
    fusion: Optional[Dict[str, Any]] = None
    confidence: Optional[Confidence] = None
    verification: Optional[Dict[str, Any]] = None   # verifier result (verified/uncertain/skipped)
    warnings: List[str] = Field(default_factory=list)

    @classmethod
    def start(cls, scene_id: str, query: str) -> "ExecutionTrace":
        return cls(
            trace_id=f"trc_{uuid4().hex[:8]}",
            scene_id=scene_id,
            query=query,
            started_at=datetime.now(timezone.utc).isoformat(),
        )

    def add_step(
        self,
        plan_step,
        *,
        status: str,
        params_requested: Optional[dict] = None,
        params_applied: Optional[dict] = None,
        result=None,
        note: Optional[str] = None,
    ) -> None:
        step = TraceStep(
            id=plan_step.id,
            tool=plan_step.tool,
            model=getattr(result, "model_id", None) if result else None,
            params_requested=params_requested or plan_step.params,
            params_applied=params_applied or {},
            status=status,
            duration_ms=getattr(result, "duration_ms", 0) if result else 0,
            confidence=getattr(result, "confidence", 0.0) if result else 0.0,
            output_summary=_one_line_summary(result) if result else note,
            artifacts=list(result.artifacts.keys()) if result and result.artifacts else [],
            facts=dict(getattr(result, "facts", {})) if result and getattr(result, "facts", None) else {},
            note=note,
            warnings=list(result.warnings) if result and result.warnings else [],
        )
        self.steps.append(step)

    def finish(self, *, status: str, confidence: Optional[Confidence] = None) -> None:
        self.finished_at = datetime.now(timezone.utc).isoformat()
        self.status = status
        self.confidence = confidence
        if self.started_at:
            start = datetime.fromisoformat(self.started_at)
            end = datetime.fromisoformat(self.finished_at)
            self.duration_ms = int((end - start).total_seconds() * 1000)


def _one_line_summary(result) -> Optional[str]:
    """Produce a one-line summary of a ToolResult for the trace."""
    if result is None:
        return None
    if result.text:
        # Truncate to ~80 chars
        t = result.text.strip()
        return t[:80] + "…" if len(t) > 80 else t
    if result.facts:
        parts = [f"{k}={v}" for k, v in list(result.facts.items())[:3]]
        return ", ".join(parts)
    return f"confidence={result.confidence}"
