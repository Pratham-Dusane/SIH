from fastapi import APIRouter, Depends
from core.auth import current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.get("/me")
async def get_me(user: dict = Depends(current_user)):
    """Return authenticated user profile and active workspace."""
    return user
