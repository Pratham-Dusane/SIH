import os
from fastapi import Depends, HTTPException, Header
from core.config import settings

async def current_user(authorization: str = Header(None)) -> dict:
    """
    FastAPI dependency for verifying Firebase Bearer ID Tokens (PRD §5.1).
    When AUTH_DISABLED=true (local dev + eval runs), returns a default local user.
    """
    if settings.AUTH_DISABLED:
        return {
            "uid": "local-dev-user",
            "email": "analyst@isro.gov.in",
            "name": "ISRO SAC Analyst",
            "workspace_id": "ws_demo",
        }

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization bearer token")

    token = authorization.split(" ", 1)[1]

    try:
        # Lazy import firebase_admin to allow light startup when disabled
        import firebase_admin
        from firebase_admin import auth as fb_auth

        if not firebase_admin._apps:
            firebase_admin.initialize_app()

        decoded = fb_auth.verify_id_token(token)
        return {
            "uid": decoded.get("uid"),
            "email": decoded.get("email"),
            "name": decoded.get("name", decoded.get("email", "").split("@")[0]),
            "workspace_id": decoded.get("workspace_id", "ws_demo"),
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid authentication token: {str(e)}")
