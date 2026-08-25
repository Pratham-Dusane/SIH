import os
import time
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from core.auth import current_user
from core.config import settings
from core.storage import get_storage, Storage

router = APIRouter(prefix="/api", tags=["uploads"])


class SignedUrlRequest(BaseModel):
    filename: str = Field(..., min_length=1)
    contentType: str = "application/octet-stream"
    sceneRole: str = "single"  # single | optical | sar | t1 | t2
    workspaceId: Optional[str] = None
    sceneId: Optional[str] = None


class SignedUrlResponse(BaseModel):
    upload_url: str
    object_path: str
    scene_id: str


@router.post("/uploads/signed-url", response_model=SignedUrlResponse)
async def get_signed_upload_url(
    payload: SignedUrlRequest,
    user: dict = Depends(current_user),
    storage: Storage = Depends(get_storage),
):
    """
    Step 1 of upload flow: Returns a signed PUT URL or local upload URL for the raster.
    """
    ws_id = payload.workspaceId or user.get("workspace_id", "ws_demo")
    scene_id = payload.sceneId or f"scene_{int(time.time() * 1000)}"
    clean_filename = Path(payload.filename).name
    role = payload.sceneRole.lower()

    object_path = f"workspaces/{ws_id}/scenes/{scene_id}/{role}/{clean_filename}"
    upload_url = storage.signed_upload_url(object_path, payload.contentType)

    return {
        "upload_url": upload_url,
        "object_path": object_path,
        "scene_id": scene_id,
    }


@router.api_route("/uploads/local/{path:path}", methods=["POST", "PUT"])
async def upload_local_file(
    path: str,
    request: Request,
    storage: Storage = Depends(get_storage),
):
    """
    Dev-only passthrough endpoint for LocalStorage direct upload.
    Accepts raw binary body or multipart form data.
    """
    dest_path = storage.local_path(path)
    Path(dest_path).parent.mkdir(parents=True, exist_ok=True)

    content_type = request.headers.get("content-type", "")
    if "multipart/form-data" in content_type:
        form = await request.form()
        uploaded_file = None
        for val in form.values():
            if hasattr(val, "file"):
                uploaded_file = val
                break
        if uploaded_file:
            with open(dest_path, "wb") as f:
                while chunk := await uploaded_file.read(1024 * 1024):
                    f.write(chunk)
            return {"status": "uploaded", "path": path, "size_bytes": os.path.getsize(dest_path)}

    body = await request.body()
    with open(dest_path, "wb") as f:
        f.write(body)

    return {"status": "uploaded", "path": path, "size_bytes": os.path.getsize(dest_path)}


@router.get("/files/{path:path}")
async def serve_file(
    path: str,
    storage: Storage = Depends(get_storage),
):
    """
    Serves static files, previews, and thumbnails in local development mode.
    """
    local_file = storage.local_path(path)
    if not os.path.isfile(local_file):
        raise HTTPException(status_code=404, detail="File not found")

    ext = Path(local_file).suffix.lower()
    media_type = "application/octet-stream"
    if ext == ".png":
        media_type = "image/png"
    elif ext in (".jpg", ".jpeg"):
        media_type = "image/jpeg"
    elif ext in (".tif", ".tiff"):
        media_type = "image/tiff"
    elif ext == ".json":
        media_type = "application/json"

    return FileResponse(local_file, media_type=media_type)
