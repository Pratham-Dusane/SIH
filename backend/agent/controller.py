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

    """
    trace = ExecutionTrace.start(scene_id=scene.id, query=query)

    print(f"\n{'='*75}")
    print(f"  [AGENT PIPELINE START] Scene: {scene.id} | Query: \"{query}\"")
    print(f"{'='*75}")

    # ------------------------------------------------------------------
    # Stage 1: Task Classification
    # ------------------------------------------------------------------
    await emit({"type": "stage", "stage": "classifying"})
    task = classify_task(query, scene)
    trace.task = task
    print(f"\n[STAGE 1: TASK CLASSIFICATION]")
    print(f"  ▸ Task Type  : {task.task.value}")
    print(f"  ▸ Confidence : {task.confidence}")
    print(f"  ▸ Evidence   : {task.evidence}")

    # ------------------------------------------------------------------
    # Stage 2: Input Gate
    # ------------------------------------------------------------------
    await emit({"type": "stage", "stage": "validating"})
    gate = input_gate(task, scene)
    trace.gate = gate.model_dump()
    print(f"\n[STAGE 2: INPUT GATE & CAPABILITIES]")
    print(f"  ▸ Gate OK    : {gate.ok}")
    print(f"  ▸ Problems   : {[p.detail for p in gate.problems]}")
    print(f"  ▸ Warnings   : {gate.warnings}")
    if not gate.ok:
        print(f"  [!] Query Refused at Input Gate: {gate.problems}")
        trace.finish(status="REFUSED")
        return QueryResult.refusal_result(gate, trace)

    # ------------------------------------------------------------------
    # Stage 3: Planning
    # ------------------------------------------------------------------
    await emit({"type": "stage", "stage": "planning"})
    plan = await make_plan(task, query, scene)
    trace.plan = {"backend": plan.backend, "step_count": len(plan.steps)}
    await emit({"type": "plan", "plan": plan.model_dump()})
    print(f"\n[STAGE 3: DAG PLANNING]")
    print(f"  ▸ Backend    : {plan.backend}")
    print(f"  ▸ Steps ({len(plan.steps)}):")
    for s in plan.steps:
        print(f"    ├─ Step {s.id}: tool='{s.tool}', reason='{s.reason}', inputs={s.inputs}")

    # ------------------------------------------------------------------
    # Stage 4: Execution
    # ------------------------------------------------------------------
    print(f"\n[STAGE 4: EXECUTION PIPELINE]")
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

    print(f"\n[STAGE 5: FUSION & GROUNDING]")
    print(f"  ▸ Fusion Mode        : {fusion.mode}")
    print(f"  ▸ Grounding Check    : {fusion.grounding_check}")
    print(f"  ▸ Unsupported Numbers: {fusion.unsupported_numbers}")
    print(f"  ▸ Step-by-Step Confidences:")
    for step_id, res in results.items():
        if hasattr(res, "confidence"):
            print(f"    ├─ Step {step_id} ({getattr(res, 'tool', 'unknown')}): confidence = {res.confidence} | basis = {getattr(res, 'confidence_basis', '')}")
    print(f"  ▸ Overall Aggregated : {confidence.value} ({confidence.band})")
    print(f"  ▸ Aggregation Basis  : {confidence.basis}")
    print(f"  ▸ Abstained          : {should_abstain(confidence)}")

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

    print(f"\n[STAGE 6: SELF-VERIFICATION]")
    if verification:
        print(f"  ▸ Status             : {verification.status}")
        print(f"  ▸ Confidence Delta   : {verification.confidence_delta}")
        print(f"  ▸ Reason             : {verification.reason}")

    print(f"\n{'='*75}")
    print(f"  🎯 [FINAL SYNTHESIZED ANSWER]")
    print(f"  {answer}")
    print(f"{'='*75}\n")

    trace.verification = verification.model_dump() if verification else None
    trace.finish(status="COMPLETE", confidence=confidence)

    return QueryResult(
        answer=answer,
        evidence=collect_evidence(results),
        confidence=confidence,
        trace=trace,
        verification=verification,
    )
