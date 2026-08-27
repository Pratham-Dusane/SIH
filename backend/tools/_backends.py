"""
Shared backend-availability contract for the online tools — PRD §7.2, §11.5.

Both hosted backends (V1 hosted VLM, G1/G2 Earth Engine) are online,
quota-limited services and declare `offline_capable=False` (§8.1/§8.2).

Two failure shapes, kept deliberately distinct so a judge reading a trace can
tell them apart:

* `NOT_EVALUATED_OFFLINE` — OFFLINE_MODE is set (§11.5).  The tool did not
  attempt a call.  This is expected, correct behaviour in the ISRO/SAC offline
  container, not an error.
* `BACKEND_UNAVAILABLE`  — the backend is missing credentials or failed to
  initialise.  The input gate (§9.3) reports this as a missing capability.

Either way the tool returns a structured `ToolResult`, never an exception.
"""

from __future__ import annotations

from typing import Optional

from core.config import settings
from tools.base import ToolResult

NOT_EVALUATED_OFFLINE = "NOT_EVALUATED_OFFLINE"
BACKEND_UNAVAILABLE = "BACKEND_UNAVAILABLE"


def offline_mode() -> bool:
    return bool(settings.OFFLINE_MODE)


def unavailable_result(tool: str, model_id: Optional[str], reason: str,
                       backend_label: str) -> ToolResult:
    """
    Structured non-result for a tool whose online backend cannot be reached.
    Confidence is 0.0, so aggregate_confidence (§9.7) excludes it entirely and
    the answer degrades honestly instead of inventing content.
    """
    if offline_mode():
        status = NOT_EVALUATED_OFFLINE
        text = (f"{tool} was not evaluated: it depends on {backend_label}, which is an "
                "online service excluded from offline evaluation mode (PRD §11.5).")
    else:
        status = BACKEND_UNAVAILABLE
        text = (f"{tool} is unavailable: {backend_label} is not configured or could not "
                f"be reached ({reason}).")

    return ToolResult(
        tool=tool,
        model_id=model_id,
        text=text,
        facts={"status": status, "reason": reason, "backend": backend_label},
        confidence=0.0,
        confidence_basis=f"{status} — no inference was performed",
        warnings=[f"{status}: {reason}"],
    )


RATE_LIMITED = "BACKEND_RATE_LIMITED"


def error_result(tool: str, model_id: Optional[str], exc: BaseException,
                 backend_label: str) -> ToolResult:
    """
    Structured non-result for a backend call that was attempted and failed.

    A quota exhaustion is called out separately from a genuine error: on a free
    tier it is by far the most likely failure during a demo, and "wait a minute
    and retry" is a different remedy from "the backend is broken".
    """
    from services.inference.vlm_gateway import VLMRateLimited

    detail = f"{type(exc).__name__}: {exc}"

    if isinstance(exc, VLMRateLimited):
        return ToolResult(
            tool=tool,
            model_id=model_id,
            text=(f"{tool} could not run: {backend_label} is rate limiting requests "
                  "and did not recover after retrying with backoff. Wait for the quota "
                  "window to reset, or switch VLM_BACKEND to another provider."),
            facts={"status": RATE_LIMITED, "reason": str(exc), "backend": backend_label},
            confidence=0.0,
            confidence_basis=f"{RATE_LIMITED} — no inference was performed",
            warnings=[f"{RATE_LIMITED}: {exc}"],
        )

    return ToolResult(
        tool=tool,
        model_id=model_id,
        text=f"{tool} failed: the {backend_label} call did not complete ({detail}).",
        facts={"status": "BACKEND_ERROR", "reason": detail, "backend": backend_label},
        confidence=0.0,
        confidence_basis="backend call failed — no inference result was produced",
        warnings=[f"BACKEND_ERROR: {detail}"],
    )
