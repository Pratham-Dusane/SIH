"""
SatQuery AI — Models Router (PRD §7.7)

Exposes endpoints for listing and viewing trained model cards.
"""

from fastapi import APIRouter, HTTPException, Depends
from services.model_registry import get_all_cards, get_card
from core.auth import current_user

router = APIRouter(prefix="/api/models", tags=["models"])


@router.get("")
async def list_models(user=Depends(current_user)):
    """PRD §7.7: GET /api/models returns all model cards."""
    cards = get_all_cards()
    return {"models": cards, "count": len(cards)}


@router.get("/{model_id}")
async def get_model_detail(model_id: str, user=Depends(current_user)):
    """GET /api/models/{model_id} returns a single model card by ID (e.g. M1, M2)."""
    card = get_card(model_id)
    if not card:
        raise HTTPException(status_code=404, detail=f"Model card '{model_id}' not found")
    return card
