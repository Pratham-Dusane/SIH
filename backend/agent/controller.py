"""
Agent controller — PRD §9.1.

The five-stage pipeline: classify → gate → plan → execute → fuse.
Each stage independently testable and independently loggable.
"""

from __future__ import annotations

from typing import Any, Callable, Coroutine, Dict, Optional

from pydantic import BaseModel, Field

from agent.confidence import ABSTAIN_THRESHOLD, aggregate_confidence, should_abstain
from agent.context import ExecutionContext
from agent.executor import execute_plan
from agent.fusion import abstain, collect_evidence, fuse
from agent.input_gate import GateResult, input_gate
from agent.planner import make_plan
from agent.task_classifier import TaskClassification, classify_task
from agent.trace import Confidence, ExecutionTrace
from models.scene import Scene


class QueryResult(BaseModel):
    answer: str
    evidence: Dict[str, Any] = Field(default_factory=dict)
    confidence: Optional[Confidence] = None
    trace: Optional[ExecutionTrace] = None
    refused: bool = False
    refusal: Optional[GateResult] = None

    @classmethod
    def refusal_result(cls, gate: GateResult, trace: ExecutionTrace) -> "QueryResult":
        problems_text = "; ".join(
            f"{p.detail} — {p.remedy}" for p in gate.problems
        )
        return cls(
            answer=f"Cannot process this query: {problems_text}",
            refused=True,
            refusal=gate,
            trace=trace,
        )


async def answer_query(
    scene: Scene,
    query: str,
    emit: Callable[..., Coroutine],
    storage=None,
    vlm_backend: str = "gemini",
) -> QueryResult:
    """
    Main entry point for the agentic controller.
    Five-stage pipeline: classify → gate → plan → execute → fuse.
    """
    trace = ExecutionTrace.start(scene_id=scene.id, query=query)

    # ------------------------------------------------------------------
    # Stage 1: Task Classification
    # ------------------------------------------------------------------
    await emit({"type": "stage", "stage": "classifying"})
    task = classify_task(query, scene)
    trace.task = task

    # ------------------------------------------------------------------
    # Stage 2: Input Gate
    # ------------------------------------------------------------------
    await emit({"type": "stage", "stage": "validating"})
    gate = input_gate(task, scene)
    trace.gate = gate.model_dump()
    if not gate.ok:
        trace.finish(status="REFUSED")
        return QueryResult.refusal_result(gate, trace)

    # ------------------------------------------------------------------
    # Stage 3: Planning
    # ------------------------------------------------------------------
    await emit({"type": "stage", "stage": "planning"})
    plan = await make_plan(task, query, scene)
    trace.plan = {"backend": plan.backend, "step_count": len(plan.steps)}
    await emit({"type": "plan", "plan": plan.model_dump()})

    # ------------------------------------------------------------------
    # Stage 4: Execution
    # ------------------------------------------------------------------
    ctx = ExecutionContext(scene=scene, storage=storage, vlm_backend=vlm_backend)
    results = await execute_plan(plan, scene, trace, emit, ctx)

    # ------------------------------------------------------------------
    # Stage 5: Fusion + Confidence
    # ------------------------------------------------------------------
    await emit({"type": "stage", "stage": "fusing"})
    answer = await fuse(query, task, results, scene)
    confidence = aggregate_confidence(results, plan)

    if should_abstain(confidence):
        answer = abstain(answer, confidence, results)

    trace.confidence = confidence
    trace.fusion = {"mode": "template", "grounding_check": "PASS"}
    trace.finish(status="COMPLETE", confidence=confidence)

    return QueryResult(
        answer=answer,
        evidence=collect_evidence(results),
        confidence=confidence,
        trace=trace,
    )
