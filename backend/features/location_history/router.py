from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import JSONResponse

from core.features import require
from features.location_history.models import (
    HistoricalContextReport,
    LocationHistoryRequest,
)
from features.location_history.service import research_location_history
from features.location_history.pdf_builder import generate_location_history_pdf

router = APIRouter(prefix="/api/location-history", tags=["location_history"])


@router.post("/research", dependencies=[Depends(require("location_history"))], response_model=HistoricalContextReport)
async def research_location(payload: LocationHistoryRequest):
    """
    Perform grounded historical and contextual research for a location,
    bounding box, or scene.
    """
    try:
        report = await research_location_history(
            location=payload.location,
            lat=payload.lat,
            lon=payload.lon,
            bbox=payload.bbox,
            date_range=payload.date_range or "2000-2026",
            topic=payload.topic or "infrastructure, flooding, urban development",
            scene_id=payload.scene_id,
        )
        return report
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Location history research failed: {e}")


@router.get("/scene/{scene_id}", dependencies=[Depends(require("location_history"))], response_model=HistoricalContextReport)
async def get_scene_location_history(
    scene_id: str,
    date_range: str = Query("2000-2026", description="Historical period window"),
    topic: str = Query("infrastructure, flooding, urban development", description="Topics to investigate"),
):
    """
    Retrieve historical context report tailored to a specific scene's geographic bounds.
    """
    try:
        report = await research_location_history(
            scene_id=scene_id,
            date_range=date_range,
            topic=topic,
        )
        return report
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch scene location history: {e}")


@router.post("/export/pdf", dependencies=[Depends(require("location_history"))])
async def export_location_history_pdf(report: HistoricalContextReport):
    """
    Render and download official PDF dossier from an existing HistoricalContextReport.
    """
    try:
        pdf_bytes = generate_location_history_pdf(report)
        filename = f"location_context_report_{report.id}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {e}")


@router.get("/scene/{scene_id}/export/pdf", dependencies=[Depends(require("location_history"))])
async def export_scene_location_history_pdf(
    scene_id: str,
    date_range: str = Query("2000-2026"),
    topic: str = Query("infrastructure, flooding, urban development"),
):
    """
    Generate and download official PDF dossier for a specific scene.
    """
    try:
        report = await research_location_history(
            scene_id=scene_id,
            date_range=date_range,
            topic=topic,
        )
        pdf_bytes = generate_location_history_pdf(report)
        filename = f"location_report_{scene_id}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to export scene location PDF: {e}")


@router.get("/scene/{scene_id}/export/json", dependencies=[Depends(require("location_history"))])
async def export_scene_location_history_json(
    scene_id: str,
    date_range: str = Query("2000-2026"),
    topic: str = Query("infrastructure, flooding, urban development"),
):
    """
    Generate and download JSON structured dataset for a specific scene.
    """
    try:
        report = await research_location_history(
            scene_id=scene_id,
            date_range=date_range,
            topic=topic,
        )
        filename = f"location_report_{scene_id}.json"
        return JSONResponse(
            content=report.model_dump(),
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to export scene location JSON: {e}")

