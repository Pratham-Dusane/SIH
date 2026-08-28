"""
Agent controller -- PRD Section 9.1.

The six-stage pipeline: classify -> gate -> plan -> execute -> fuse -> verify.
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
from agent.verifier import VerificationResult
from models.scene import Scene
from core.config import settings


class QueryResult(BaseModel):
    answer: str
    evidence: Dict[str, Any] = Field(default_factory=dict)
    confidence: Optional[Confidence] = None
    trace: Optional[ExecutionTrace] = None
    refused: bool = False
    refusal: Optional[GateResult] = None
    verification: Optional[VerificationResult] = None

    @classmethod
    def refusal_result(cls, gate: GateResult, trace: ExecutionTrace) -> "QueryResult":
        problems_text = "; ".join(
            f"{p.detail} -- {p.remedy}" for p in gate.problems
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
    verify: Optional[bool] = None,
) -> QueryResult:
    """
    Main entry point for the agentic controller.
    Six-stage pipeline: classify -> gate -> plan -> execute -> fuse -> verify.

    `verify` overrides the global VERIFY_ANSWERS setting when not None
    (allows per-request toggle from the frontend UI).
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
    fusion = await fuse(query, task, results, scene)
    answer = fusion.answer
    confidence = aggregate_confidence(results, plan)

    if should_abstain(confidence):
        answer = abstain(answer, confidence, results)

    trace.confidence = confidence
    # Record what actually happened.  A hardcoded "PASS" here would claim the
    # numeric grounding check succeeded even on the runs where it caught an
    # unsupported figure and forced the fallback rendering (§9.6, R11).
    trace.fusion = {
        "mode": fusion.mode,
        "grounding_check": fusion.grounding_check,
        "unsupported_numbers": fusion.unsupported_numbers,
        "unverified_numbers": fusion.unverified_numbers,
        "abstained": should_abstain(confidence),
    }
    if fusion.grounding_check == "FAIL":
        await emit({
            "type": "grounding",
            "status": "FAIL",
            "unsupported_numbers": fusion.unsupported_numbers,
        })

    # ------------------------------------------------------------------
    # Stage 6: Self-Verification (optional, configurable)
    # ------------------------------------------------------------------
    should_verify = verify if verify is not None else settings.VERIFY_ANSWERS
    verification: Optional[VerificationResult] = None

    if should_verify and not should_abstain(confidence):
        await emit({"type": "stage", "stage": "verifying"})
        try:
            from agent.verifier import verify_answer
            images = ctx.model_ready_images()
            verification = await verify_answer(answer, images, vlm_backend=vlm_backend)

            # Apply confidence adjustment
            if verification.confidence_delta != 0:
                adjusted = max(0.0, min(1.0, confidence.value + verification.confidence_delta))
                confidence.value = round(adjusted, 3)
                band = "HIGH" if adjusted >= 0.75 else ("MEDIUM" if adjusted >= 0.45 else "LOW")
                confidence.band = band

            await emit({
                "type": "verification",
                "status": verification.status,
                "reason": verification.reason,
            })
        except Exception as e:
            verification = VerificationResult.skipped(f"Error: {type(e).__name__}")
            await emit({
                "type": "verification",
                "status": "skipped",
                "reason": str(e),
            })
    else:
        if not should_verify:
            verification = VerificationResult.skipped("Verification disabled by user or config.")
        else:
            verification = VerificationResult.skipped("Skipped due to low confidence (abstention).")

    trace.verification = verification.model_dump() if verification else None
    trace.finish(status="COMPLETE", confidence=confidence)

    return QueryResult(
        answer=answer,
        evidence=collect_evidence(results),
        confidence=confidence,
        trace=trace,
        verification=verification,
    )
