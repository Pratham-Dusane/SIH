from datetime import datetime, timezone
import os
from pathlib import Path
import time
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status

from core.auth import current_user
from core.db import get_db, Database
from core.storage import get_storage, Storage
from models.scene import (
    Scene,
    SceneConfirmRequest,
    SceneImage,
    SceneROI,
    CompatibilityReport,
    RasterMetadata,
    ModalityResult,
)
from services.ingest.raster_reader import read_metadata, UnsupportedFormat
from services.ingest.modality_detector import detect_modality
from services.ingest.compatibility_checker import check_compatibility
from services.ingest.preview import generate_previews

router = APIRouter(prefix="/api/scenes", tags=["scenes"])


@router.post("/confirm", response_model=Scene)
async def confirm_scene(
    payload: SceneConfirmRequest,
    user: dict = Depends(current_user),
    db: Database = Depends(get_db),
    storage: Storage = Depends(get_storage),
):
    """
    Ingest uploaded rasters: extract metadata, detect modality, generate previews,
    and validate compatibility checklist (Requirement R8).
    Returns HTTP 422 with the checklist report if verdict is FAIL.
    """
    if not payload.images:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No images provided in confirmation request"
        )

    processed_images: List[SceneImage] = []
    meta_for_checker: List[Dict[str, Any]] = []
    modalities_list: List[str] = []

    # Infer scene_id from the first object_path or generate a new one
    # Object path convention: workspaces/{workspaceId}/scenes/{sceneId}/{role}/{filename}
    parts = payload.images[0].object_path.strip("/\\").split("/")
    scene_id = parts[3] if len(parts) >= 4 and parts[2] == "scenes" else f"scene_{int(time.time() * 1000)}"

    for img_req in payload.images:
        local_path = storage.local_path(img_req.object_path)
        if not os.path.isfile(local_path):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Uploaded file not found at object path: {img_req.object_path}"
            )

        try:
            meta = read_metadata(local_path, benchmark_mode=payload.benchmark_mode)
        except UnsupportedFormat as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e)
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to read raster metadata for {img_req.original_filename}: {str(e)}"
            )

        # Detect modality
        modality_info = detect_modality(meta)
        modality_label = modality_info["modality"]
        modalities_list.append(modality_label)

        # Generate previews in preview subfolder
        preview_rel_dir = f"workspaces/{payload.workspace_id}/scenes/{scene_id}/previews/{img_req.role}"
        preview_disk_dir = storage.local_path(preview_rel_dir)
        preview_results = generate_previews(meta, local_path, preview_disk_dir, modality=modality_label)

        preview_obj_path = f"{preview_rel_dir}/preview.png"
        thumb_obj_path = f"{preview_rel_dir}/thumb.png"

        scene_image = SceneImage(
            role=img_req.role,
            original_filename=img_req.original_filename,
            object_path=img_req.object_path,
            metadata=RasterMetadata(**meta),
            modality=ModalityResult(**modality_info),
            preview_path=preview_obj_path,
            thumb_path=thumb_obj_path,
            preview_url=storage.public_url(preview_obj_path),
            thumb_url=storage.public_url(thumb_obj_path),
        )
        processed_images.append(scene_image)

        # Build checker item
        checker_item = dict(meta)
        checker_item["path"] = local_path
        checker_item["modality"] = modality_info
        meta_for_checker.append(checker_item)

    # Run R8 Compatibility Check
    compat_dict = check_compatibility(
        meta_for_checker,
        declared_config=payload.input_config,
        benchmark_mode=payload.benchmark_mode,
    )

    # Requirement R8: If compatibility check fails, block query and return HTTP 422 with checklist
    if compat_dict["verdict"] == "FAIL":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": "Scene compatibility validation failed (R8)",
                "verdict": compat_dict["verdict"],
                "checks": compat_dict["checks"],
                "target_crs": compat_dict.get("target_crs"),
                "target_gsd_m": compat_dict.get("target_gsd_m"),
            }
        )

    # Extract all warnings from checks so they are attached to the scene
    warnings = [
        f"[{c['name']}] {c['detail']}"
        for c in compat_dict.get("checks", [])
        if c.get("status") == "WARN"
    ]

    scene_name = payload.name or f"Scene {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')}"
    source_tag = f"benchmark:{payload.benchmark_dataset}" if (payload.benchmark_mode and payload.benchmark_dataset) else "user_upload"

    scene_obj = Scene(
        id=scene_id,
        workspace_id=payload.workspace_id,
        name=scene_name,
        input_config=payload.input_config,
        benchmark_mode=payload.benchmark_mode,
        source=source_tag,
        images=processed_images,
        compatibility=CompatibilityReport(**compat_dict),
        modalities=modalities_list,
        coreg_shift_px=compat_dict.get("coreg_shift_px"),
        warnings=warnings,
        created_at=datetime.now(timezone.utc).isoformat(),
    )

    # Store scene document in DB
    db.set_document("scenes", scene_id, scene_obj.model_dump())
    return scene_obj


@router.get("", response_model=List[Scene])
async def list_scenes(
    workspace_id: Optional[str] = Query(None),
    user: dict = Depends(current_user),
    db: Database = Depends(get_db),
):
    """List all scenes for the workspace."""
    ws_id = workspace_id or user.get("workspace_id", "ws_demo")
    scenes = db.list_documents("scenes", filters={"workspace_id": ws_id})
    return [Scene(**s) for s in scenes]


@router.get("/{scene_id}", response_model=Scene)
async def get_scene(
    scene_id: str,
    user: dict = Depends(current_user),
    db: Database = Depends(get_db),
):
    """Retrieve detailed scene information by ID."""
    scene_data = db.get_document("scenes", scene_id)
    if not scene_data:
        raise HTTPException(status_code=404, detail="Scene not found")
    return Scene(**scene_data)


@router.post("/{scene_id}/revalidate", response_model=Scene)
async def revalidate_scene(
    scene_id: str,
    user: dict = Depends(current_user),
    db: Database = Depends(get_db),
    storage: Storage = Depends(get_storage),
):
    """Re-run modality detection and compatibility checks on an existing scene."""
    scene_data = db.get_document("scenes", scene_id)
    if not scene_data:
        raise HTTPException(status_code=404, detail="Scene not found")

    scene = Scene(**scene_data)
    meta_for_checker = []
    modalities = []

    for img in scene.images:
        local_path = storage.local_path(img.object_path)
        meta = read_metadata(local_path, benchmark_mode=scene.benchmark_mode)
        modality_info = detect_modality(meta)
        img.metadata = RasterMetadata(**meta)
        img.modality = ModalityResult(**modality_info)
        modalities.append(modality_info["modality"])

        checker_item = dict(meta)
        checker_item["path"] = local_path
        checker_item["modality"] = modality_info
        meta_for_checker.append(checker_item)

    compat_dict = check_compatibility(
        meta_for_checker,
        declared_config=scene.input_config,
        benchmark_mode=scene.benchmark_mode,
    )

    warnings = [
        f"[{c['name']}] {c['detail']}"
        for c in compat_dict.get("checks", [])
        if c.get("status") == "WARN"
    ]

    scene.compatibility = CompatibilityReport(**compat_dict)
    scene.modalities = modalities
    scene.coreg_shift_px = compat_dict.get("coreg_shift_px")
    scene.warnings = warnings

    db.set_document("scenes", scene_id, scene.model_dump())
    return scene


@router.post("/{scene_id}/roi", response_model=Scene)
async def set_scene_roi(
    scene_id: str,
    roi: Dict[str, Any],
    user: dict = Depends(current_user),
    db: Database = Depends(get_db),
):
    """Set or clear the region of interest (ROI) geometry for the scene."""
    scene_data = db.get_document("scenes", scene_id)
    if not scene_data:
        raise HTTPException(status_code=404, detail="Scene not found")

    scene_data["roi"] = roi
    db.set_document("scenes", scene_id, scene_data)
    return Scene(**scene_data)


@router.delete("/{scene_id}")
async def delete_scene(
    scene_id: str,
    user: dict = Depends(current_user),
    db: Database = Depends(get_db),
    storage: Storage = Depends(get_storage),
):
    """Delete a scene and all its stored preview / derived artifacts."""
    scene_data = db.get_document("scenes", scene_id)
    if not scene_data:
        raise HTTPException(status_code=404, detail="Scene not found")

    ws_id = scene_data.get("workspace_id", "ws_demo")
    prefix = f"workspaces/{ws_id}/scenes/{scene_id}"
    storage.delete_prefix(prefix)
    db.delete_document("scenes", scene_id)

    return {"status": "deleted", "scene_id": scene_id}
