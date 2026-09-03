"""
Historical scenes router — Extensions PRD §8 & §16.
"""
from typing import Optional
from fastapi import APIRouter, Depends, Query

from core.features import require
from features.historical.models import (
    AnalyticsOverview, AssistantRequest, AssistantResponse,
)
from features.historical.analytics import compute_analytics_overview

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/overview", dependencies=[Depends(require("historical"))], response_model=AnalyticsOverview)
async def get_analytics_overview(
    district: Optional[str] = Query(None, description="Filter by district name"),
    config: Optional[str] = Query(None, description="Filter by input config (SINGLE, BI_TEMPORAL, CROSS_MODAL)"),
    start_date: Optional[str] = Query(None, description="Start date ISO filter"),
    end_date: Optional[str] = Query(None, description="End date ISO filter"),
):
    """Serve aggregated historical analytics payload across scenes and time."""
    return compute_analytics_overview(
        district_filter=district,
        config_filter=config,
        start_date=start_date,
        end_date=end_date,
    )


@router.post("/reindex", dependencies=[Depends(require("historical"))])
async def reindex_districts():
    """Backfill administrative district labels on all stored scenes."""
    from core.db import get_db
    from core.geo.admin_lookup import get_admin_lookup

    db = get_db()
    lookup = get_admin_lookup()
    scenes = db.list_documents("scenes") if hasattr(db, "list_documents") else []
    updated = 0

    for s in scenes:
        images = s.get("images", [])
        if images and "metadata" in images[0]:
            bounds = images[0]["metadata"].get("bounds_wgs84")
            if bounds and len(bounds) == 4:
                cx = (bounds[0] + bounds[2]) / 2.0
                cy = (bounds[1] + bounds[3]) / 2.0
                admin = lookup.label_for(cx, cy)
                if admin:
                    s["place_labels"] = [admin.model_dump()]
                    db.set_document("scenes", s["id"], s)
                    updated += 1

    return {"status": "ok", "scenes_reindexed": updated, "total_scenes": len(scenes)}


@router.post(
    "/assistant",
    dependencies=[Depends(require("historical"))],
    response_model=AssistantResponse,
)
async def ask_assistant(req: AssistantRequest):
    """
    Cross-scene retrieval assistant (Extensions PRD §8, F5).

    Read-only over `scenes` / `queries` / `traces`.  Workspace totals are
    computed in Python and returned alongside the prose, so the UI can render
    figures without trusting the model's arithmetic, and every answer carries
    the scene ids it was retrieved from.
    """
    from core.db import get_db
    from features.historical.rag import answer_question

    return AssistantResponse(**await answer_question(
        get_db(), req.question, vlm_backend=req.vlm_backend, k=req.k,
    ))
