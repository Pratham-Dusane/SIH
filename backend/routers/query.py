"""
Query router - PRD §14.

SSE endpoint: POST /api/scenes/{scene_id}/query
Streams execution stages, plan steps, and the final answer as server-sent events.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from core.auth import current_user
from core.config import settings
from core.db import get_db, Database
from core.storage import get_storage, Storage
from models.scene import Scene

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/scenes", tags=["query"])

def _persist_query(db, scene, query_text: str, result) -> None:
    """
    Store the query and its trace.

    Without this nothing is ever written: /api/stats reports zero queries
    forever, and the trace a judge is meant to inspect (R11) exists only for
    the lifetime of the request. Failure here must not break the answer the
    user is waiting on, so it is logged and swallowed.
    """
    try:
        trace = result.trace.model_dump() if result.trace else None
        query_id = (trace or {}).get("trace_id") or f"q_{int(time.time() * 1000)}"
        db.set_document("queries", query_id, {
            "id": query_id,
            "scene_id": scene.id,
            "workspace_id": getattr(scene, "workspace_id", "ws_demo"),
            "query": query_text,
            "answer": result.answer,
            "confidence": result.confidence.model_dump() if result.confidence else None,
            "evidence": result.evidence,
            "refused": result.refused,
            "abstained": bool(result.refused),
            "trace_id": (trace or {}).get("trace_id"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        if trace:
            db.set_document("traces", trace["trace_id"], trace)
    except Exception:  # noqa: BLE001 - persistence must never fail the query
        log.exception("Failed to persist query/trace for scene %s", scene.id)



class QueryRequest(BaseModel):
    query: str
    # Defaults to the configured VLM_BACKEND (§15) rather than a hardcoded
    # provider; callers may still override per request.
    vlm_backend: Optional[Literal["gemini", "gpt4v", "claude", "vertex"]] = None
    # Per-request override for self-verification.  None = use the global
    # VERIFY_ANSWERS setting; True/False = force on/off for this request.
    verify: Optional[bool] = None
    # User-drawn vector annotations / GeoJSON context
    annotations: Optional[Dict[str, Any]] = None
    focus_box: Optional[List[float]] = None
    focus_point: Optional[List[float]] = None


QueryRequest.model_rebuild()


@router.post("/{scene_id}/query")
async def query_scene(
    scene_id: str,
    payload: QueryRequest,
    user: dict = Depends(current_user),
    db: Database = Depends(get_db),
    storage: Storage = Depends(get_storage),
):
    """
    Run an agentic query against a scene.
    Returns server-sent events streaming the execution pipeline.
    """
    scene_data = db.get_document("scenes", scene_id)
    if not scene_data:
        raise HTTPException(status_code=404, detail="Scene not found")

    scene = Scene(**scene_data)

    # Verify scene is queryable (not FAIL verdict)
    if scene.compatibility.verdict == "FAIL":
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Scene failed compatibility checks - cannot query",
                "verdict": scene.compatibility.verdict,
            },
        )

    async def event_stream():
        """Generator that yields SSE events."""
        queue: asyncio.Queue = asyncio.Queue()

        async def emit(event: Dict[str, Any]):
            await queue.put(event)

        async def run_pipeline():
            try:
                # Import here to avoid circular imports at startup
                from agent.controller import answer_query

                result = await answer_query(
                    scene=scene,
                    query=payload.query,
                    emit=emit,
                    storage=storage,
                    vlm_backend=payload.vlm_backend or settings.VLM_BACKEND,
                    verify=payload.verify,
                    annotations=payload.annotations,
                )
                _persist_query(db, scene, payload.query, result)
                await queue.put({"type": "result", "data": {
                    "answer": result.answer,
                    "confidence": result.confidence.model_dump() if result.confidence else None,
                    "evidence": result.evidence,
                    "refused": result.refused,
                    "trace_id": result.trace.trace_id if result.trace else None,
                    # The trace itself, not just its id.  Sending only the id
                    # left the UI with nothing to render (R11): there is no
                    # endpoint it could have fetched the trace from, so the
                    # execution drawer was permanently empty.
                    "trace": result.trace.model_dump() if result.trace else None,
                    "verification": result.verification.model_dump() if result.verification else None,
                }})
            except Exception as e:
                log.exception("Query pipeline error")
                await queue.put({"type": "error", "message": str(e)})
            finally:
                await queue.put(None)  # sentinel

        # Start pipeline in background
        task = asyncio.create_task(run_pipeline())

        try:
            while True:
                event = await queue.get()
                if event is None:
                    break
                yield f"data: {json.dumps(event)}\n\n"
        finally:
            if not task.done():
                task.cancel()

        # Store the query result in the database
        # (done after streaming completes to not block the response)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{scene_id}/query/sync")
async def query_scene_sync(
    scene_id: str,
    payload: QueryRequest,
    user: dict = Depends(current_user),
    db: Database = Depends(get_db),
    storage: Storage = Depends(get_storage),
):
    """
    Non-streaming variant of the query endpoint.
    Returns the full result as JSON (useful for testing and eval).
    """
    scene_data = db.get_document("scenes", scene_id)
    if not scene_data:
        raise HTTPException(status_code=404, detail="Scene not found")

    scene = Scene(**scene_data)

    if scene.compatibility.verdict == "FAIL":
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Scene failed compatibility checks - cannot query",
                "verdict": scene.compatibility.verdict,
            },
        )

    events = []

    async def emit(event: Dict[str, Any]):
        events.append(event)

    from agent.controller import answer_query

    result = await answer_query(
        scene=scene,
        query=payload.query,
        emit=emit,
        storage=storage,
        vlm_backend=payload.vlm_backend or settings.VLM_BACKEND,
        verify=payload.verify,
    )

    _persist_query(db, scene, payload.query, result)

    return {
        "answer": result.answer,
        "confidence": result.confidence.model_dump() if result.confidence else None,
        "evidence": result.evidence,
        "refused": result.refused,
        "refusal": result.refusal.model_dump() if result.refusal else None,
        "trace": result.trace.model_dump() if result.trace else None,
        "verification": result.verification.model_dump() if result.verification else None,
        "events": events,
    }
