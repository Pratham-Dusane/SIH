"""
Dashboard stats - GET /api/stats.

Real counts from the store, computed on read.  The dashboard was calling this
endpoint before it existed; the frontend answered the 404 by substituting demo
numbers, which is exactly the kind of quiet fiction this system must not do.

Every figure here is derived from stored documents. An empty workspace reports
zeros, not placeholders.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query

from core.auth import current_user
from core.db import Database, get_db

router = APIRouter(prefix="/api", tags=["stats"])


@router.get("/stats")
async def dashboard_stats(
    workspace_id: Optional[str] = Query(None),
    user: dict = Depends(current_user),
    db: Database = Depends(get_db),
):
    """Scene/query counts and confidence aggregates for the dashboard."""
    ws_id = workspace_id or user.get("workspace_id", "ws_demo")

    scenes = db.list_documents("scenes", filters={"workspace_id": ws_id}) or []
    queries = db.list_documents("queries", filters={"workspace_id": ws_id}) or []

    confidences = []
    abstained = 0
    for q in queries:
        conf = q.get("confidence")
        if isinstance(conf, dict) and isinstance(conf.get("value"), (int, float)):
            confidences.append(float(conf["value"]))
        if q.get("abstained") or q.get("refused"):
            abstained += 1

    total_queries = len(queries)
    return {
        "scenes_ingested": len(scenes),
        "queries_answered": total_queries,
        "average_confidence": (
            round(sum(confidences) / len(confidences), 3) if confidences else 0.0
        ),
        "abstention_rate": (
            round(abstained / total_queries, 3) if total_queries else 0.0
        ),
    }


@router.get("/traces/{trace_id}")
async def get_trace(
    trace_id: str,
    user: dict = Depends(current_user),
    db: Database = Depends(get_db),
):
    """
    Full ExecutionTrace JSON - PRD §14.

    R11 requires the execution record to be inspectable after the fact, not
    only in the response that produced it.
    """
    from fastapi import HTTPException

    trace = db.get_document("traces", trace_id)
    if not trace:
        raise HTTPException(status_code=404, detail="Trace not found")
    return trace


@router.get("/queries/{query_id}")
async def get_query(
    query_id: str,
    user: dict = Depends(current_user),
    db: Database = Depends(get_db),
):
    """Stored QueryResult - PRD §14."""
    from fastapi import HTTPException

    q = db.get_document("queries", query_id)
    if not q:
        raise HTTPException(status_code=404, detail="Query not found")
    return q
