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
