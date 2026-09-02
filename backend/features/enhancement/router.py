"""
Enhancement API router — Extensions PRD §4.
"""
from fastapi import APIRouter, Depends, HTTPException
from core.features import require
from features.enhancement.models import EnhancementConfig, EnhancementRecord

router = APIRouter(prefix="/api/scenes", tags=["enhancement"])

# In-memory store for enhancement records (scene_id -> record)
_records: dict = {}


@router.post("/{scene_id}/enhance", dependencies=[Depends(require("enhancement"))])
async def run_enhancement(scene_id: str, config: EnhancementConfig = EnhancementConfig()):
    """Run or re-run enhancement on a scene."""
    from core.db import get_db
    db = get_db()
    scene_data = db.get_document("scenes", scene_id) if hasattr(db, "get_document") else None
    if not scene_data:
        raise HTTPException(404, f"Scene '{scene_id}' not found")

    # Build a basic meta dict from the scene
    images = scene_data.get("images", [])
    if not images:
        raise HTTPException(400, "Scene has no images")

    img = images[0]
    meta = img.get("metadata", {})
    modality = img.get("modality", {}).get("modality", "OPTICAL")

    # Try to load the raster array
    import numpy as np
    obj_path = img.get("object_path", "")
    arr = None

    if obj_path:
        from core.storage import get_storage
        storage = get_storage()
        full_path = storage.local_path(obj_path) if hasattr(storage, 'local_path') else obj_path
        try:
            import rasterio
            with rasterio.open(full_path) as src:
                arr = src.read().transpose(1, 2, 0).astype(np.float32)
                if arr.max() > 1.0:
                    arr = arr / max(arr.max(), 1.0)
        except Exception:
            pass

    if arr is None:
        # Generate a placeholder record without actual processing
        record = EnhancementRecord(
            method=config.method,
            params=config.model_dump(),
            accepted=False,
            rejection_reason="Could not load raster for enhancement",
            duration_ms=0,
        )
        _records[scene_id] = record.model_dump()
        return record.model_dump()

    from services.ingest.enhance import enhance
    sar_modality = "SAR" if modality == "SAR" else "optical"
    enhanced_arr, record_dict = enhance(
        meta=meta,
        arr=arr,
        modality=sar_modality,
        method=config.method,
        clahe_clip=config.clahe_clip,
        pansharpen_algo=config.pansharpen_algo,
        speckle_method=config.speckle_method,
        tile_px=config.tile_px,
        overlap_px=config.overlap_px,
        sr_weights=config.sr_weights,
        min_ssim=config.min_ssim,
        min_sharpness_gain=config.min_sharpness_gain,
    )

    _records[scene_id] = record_dict
    return record_dict


@router.get("/{scene_id}/enhancement", dependencies=[Depends(require("enhancement"))])
async def get_enhancement(scene_id: str):
    """Get the current enhancement record for a scene."""
    record = _records.get(scene_id)
    if not record:
        raise HTTPException(404, "No enhancement record for this scene")
    return record


@router.delete("/{scene_id}/enhancement", dependencies=[Depends(require("enhancement"))])
async def revert_enhancement(scene_id: str):
    """Revert to the original raster (delete enhancement record)."""
    if scene_id in _records:
        del _records[scene_id]
    return {"status": "reverted", "scene_id": scene_id}
