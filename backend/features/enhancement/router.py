"""
Enhancement API router — Extensions PRD §4.
"""
import os

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

    # Write the enhanced pixels out as a preview and point the scene image at
    # it.  Previously `enhanced_arr` was computed and then dropped on the floor:
    # only the metrics were kept, so the canvas kept rendering the original and
    # enhancement appeared to do nothing at all.
    if record_dict.get("accepted"):
        try:
            import numpy as np
            from PIL import Image

            out = np.asarray(enhanced_arr, dtype="float32")
            if out.ndim == 3 and out.shape[0] in (1, 3, 4) and out.shape[0] < out.shape[-1]:
                out = out.transpose(1, 2, 0)          # (C,H,W) -> (H,W,C)
            if out.ndim == 2:
                out = np.stack([out] * 3, axis=-1)
            if out.ndim == 3 and out.shape[2] == 1:
                out = np.repeat(out, 3, axis=2)
            out = out[:, :, :3]

            lo, hi = float(np.nanmin(out)), float(np.nanmax(out))
            norm = (out - lo) / (hi - lo) if hi - lo > 1e-9 else np.zeros_like(out)
            u8 = np.clip(np.nan_to_num(norm) * 255.0, 0, 255).astype("uint8")

            preview_path = img.get("preview_path") or ""
            rel_dir = preview_path.rsplit("/", 1)[0] if "/" in preview_path else (
                f"workspaces/{scene_data.get('workspace_id', 'ws_demo')}"
                f"/scenes/{scene_id}/previews/{img.get('role', 'single')}"
            )
            enhanced_rel = f"{rel_dir}/enhanced.png"
            disk = storage.local_path(enhanced_rel)
            os.makedirs(os.path.dirname(disk), exist_ok=True)
            Image.fromarray(u8).save(disk, format="PNG")

            img["enhanced_path"] = enhanced_rel
            img["enhanced_url"] = (
                storage.public_url(enhanced_rel)
                if hasattr(storage, "public_url") else enhanced_rel
            )
            scene_data["images"][0] = img
            db.set_document("scenes", scene_id, scene_data)

            record_dict["enhanced_url"] = img["enhanced_url"]
        except Exception as e:  # noqa: BLE001 - metrics still stand if writing fails
            record_dict.setdefault("warnings", []).append(
                f"Enhanced raster computed but could not be written: {type(e).__name__}: {e}"
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
