import time
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from core.auth import current_user
from core.db import get_db, Database
from models.workspace import WorkspaceCreate, Workspace

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])

@router.get("")
async def list_workspaces(user: dict = Depends(current_user), db: Database = Depends(get_db)):
    """List workspaces where the authenticated user is a member or owner."""
    all_workspaces = db.list_documents("workspaces")
    if not all_workspaces:
        # Default workspace for demo
        demo_ws = {
            "id": "ws_demo",
            "name": "ISRO SAC Evaluation Workspace",
            "org_type": "Government / ISRO",
            "owner_id": user["uid"],
            "members": [user["uid"]],
            "default_region": "India (South Asia)",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        db.set_document("workspaces", "ws_demo", demo_ws)
        return [demo_ws]

    user_ws = [
        w for w in all_workspaces
        if user["uid"] in w.get("members", []) or w.get("owner_id") == user["uid"] or settings.AUTH_DISABLED
    ]
    return user_ws

@router.post("", response_model=Workspace)
async def create_workspace(
    payload: WorkspaceCreate,
    user: dict = Depends(current_user),
    db: Database = Depends(get_db)
):
    """Create a new workspace (PRD §5.3)."""
    ws_id = f"ws_{int(time.time() * 1000)}"
    ws_data = {
        "id": ws_id,
        "name": payload.name,
        "org_type": payload.org_type,
        "owner_id": user["uid"],
        "members": [user["uid"]],
        "default_region": payload.default_region or "India",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    db.set_document("workspaces", ws_id, ws_data)
    return ws_data

@router.get("/{workspace_id}")
async def get_workspace(
    workspace_id: str,
    user: dict = Depends(current_user),
    db: Database = Depends(get_db)
):
    """Get detailed workspace information by ID."""
    ws = db.get_document("workspaces", workspace_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return ws
