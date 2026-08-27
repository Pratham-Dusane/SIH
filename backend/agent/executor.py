"""
Executor — PRD §9.5.

Runs plan steps sequentially, binding and validating parameters,
enforcing per-tool timeouts, and streaming status events to the client.
A failed step never aborts the plan.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Callable, Coroutine, Dict, Optional

from agent.context import ExecutionContext
from agent.plan_schema import ExecutionPlan
from agent.trace import ExecutionTrace
from tools.bind_params import bind_params
from tools.registry import REGISTRY

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Per-tool timeouts in seconds — PRD §9.5
# ---------------------------------------------------------------------------
TOOL_TIMEOUTS: Dict[str, int] = {
    "spectral_index":   30,
    "sar_water_mask":   30,
    "geo_stats":        30,
    "coreg_check":      30,
    "rs_vqa":           90,
    "rs_caption":       90,
    "rs_ground":        60,
    "rs_classify":      90,
    "change_detect":    120,
    "change_describe":  90,
    "change_vqa":       90,
    "sar_optical_fuse": 60,
}
DEFAULT_TIMEOUT = 60


def _resolve_refs(step, ctx: ExecutionContext) -> dict:
    """
    Merge step.params with step.inputs, resolving artifact references.
    """
    merged = dict(step.params)
    for key, ref in step.inputs.items():
        artifact = ctx.get_artifact(ref)
        if artifact is not None:
            # For mask_ref params, keep the string reference — the tool resolves it
            if key == "mask_ref":
                merged[key] = ref
            else:
                merged[key] = artifact
        else:
            merged[key] = ref  # pass through, let the tool handle missing refs
    return merged


async def execute_plan(
    plan: ExecutionPlan,
    scene,
    trace: ExecutionTrace,
    emit: Callable[..., Coroutine],
    ctx: ExecutionContext,
) -> Dict[str, Any]:
    """
    Execute every step in the plan.  Failed/timed-out steps produce a
    low-confidence ToolResult instead of aborting — later steps run with
    whatever is available, and fusion reports honestly on partial evidence.
    """
    from tools.base import ToolResult  # local import to avoid circular

    for step in plan.steps:
        tool = REGISTRY.get(step.tool)
        if tool is None:
            trace.add_step(step, status="SKIPPED", note=f"Unknown tool '{step.tool}'")
            await emit({"type": "step", "id": step.id, "tool": step.tool,
                        "status": "skipped", "note": f"Unknown tool '{step.tool}'"})
            continue

        # Check if tool can run on this scene
        ok, why = tool.can_run(scene)
        if not ok:
            trace.add_step(step, status="SKIPPED", note=why)
            await emit({"type": "step", "id": step.id, "tool": step.tool,
                        "status": "skipped", "note": why})
            continue

        # Bind and validate parameters (R9 enforcement)
        resolved_params = _resolve_refs(step, ctx)
        try:
            params, warns = bind_params(tool, resolved_params)
        except Exception as e:
            result = ToolResult(
                tool=tool.name, confidence=0.0,
                confidence_basis=f"parameter binding failed: {e}",
                warnings=[f"Parameter binding error: {e}"],
            )
            ctx.results[step.id] = result
            trace.add_step(step, status="FAILED",
                           params_requested=step.params,
                           params_applied={}, result=result)
            await emit({"type": "step", "id": step.id, "tool": step.tool,
                        "status": "failed", "note": str(e)})
            continue

        # Emit running status
        await emit({"type": "step", "id": step.id, "tool": step.tool,
                    "status": "running", "params": params.model_dump(),
                    "reason": step.reason})

        # Execute with timeout
        timeout = TOOL_TIMEOUTS.get(tool.name, DEFAULT_TIMEOUT)
        t0 = time.perf_counter()
        try:
            result = await asyncio.wait_for(tool.run(ctx, params), timeout=timeout)
        except asyncio.TimeoutError:
            result = ToolResult(
                tool=tool.name, confidence=0.0,
                confidence_basis="timeout",
                warnings=[f"Timed out after {timeout}s"],
            )
        except Exception as e:
            log.exception("tool %s failed", tool.name)
            result = ToolResult(
                tool=tool.name, confidence=0.0,
                confidence_basis="error",
                warnings=[f"{type(e).__name__}: {e}"],
            )

        result.duration_ms = int((time.perf_counter() - t0) * 1000)
        result.warnings += warns

        # Store in context for downstream step references
        ctx.results[step.id] = result

        # Record in trace
        trace.add_step(
            step,
            status="OK" if result.confidence > 0 else "FAILED",
            params_requested=step.params,
            params_applied=params.model_dump(),
            result=result,
        )

        # Emit completion
        await emit({
            "type": "step", "id": step.id, "tool": step.tool,
            "status": "complete",
            "summary": _one_line(result),
            "confidence": result.confidence,
            "duration_ms": result.duration_ms,
        })

    return ctx.results


def _one_line(result) -> str:
    """One-line summary for SSE events."""
    if result.text:
        t = result.text.strip()
        return t[:100] + "…" if len(t) > 100 else t
    if result.facts:
        parts = [f"{k}={v}" for k, v in list(result.facts.items())[:3]]
        return ", ".join(parts)
    return f"confidence={result.confidence}"
