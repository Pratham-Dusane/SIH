"""
Seed service — auto-populates satquery.db with demo scenes (e.g. scn_single_01)
using real raster files (e.g. D:\\SIH\\_data\\OUTPUT.tif) on startup so the live backend
can run real deterministic tools and VLM calls on demo scenes.
"""

from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path

from core.config import settings
from core.db import Database
from core.storage import LocalStorage
from models.scene import (
    Scene,
    SceneImage,
    CompatibilityReport,
    CheckItem,
    RasterMetadata,
    ModalityResult,
)
from services.ingest.raster_reader import read_metadata
from services.ingest.modality_detector import detect_modality
from services.ingest.preview import generate_previews

log = logging.getLogger(__name__)


def seed_demo_scenes(db: Database):
    """
    Ensure scn_single_01 is populated in satquery.db using the sample GeoTIFF.
    """
    existing = db.get_document("scenes", "scn_single_01")
    if existing:
        log.info("Demo scene scn_single_01 already seeded in database.")
        return

    # Source raster path search across possible root locations
    candidates = [
        Path(__file__).resolve().parent.parent.parent.parent / "_data" / "OUTPUT.tif",
        Path(__file__).resolve().parent.parent.parent / "_data" / "OUTPUT.tif",
        Path(__file__).resolve().parent.parent.parent.parent / "_demo_data" / "cartosat_optical.tif",
        Path(__file__).resolve().parent.parent.parent / "_demo_data" / "cartosat_optical.tif",
    ]
    sample_tif = None
    for cand in candidates:
        if cand.is_file():
            sample_tif = cand
            break

    if not sample_tif:
        log.warning("No sample GeoTIFF found for seeding demo scene.")
        return

    storage = LocalStorage()
    scene_id = "scn_single_01"
    workspace_id = "ws_demo"
    role = "optical"
    clean_name = sample_tif.name

    # Destination in storage workspace
    obj_rel_path = f"workspaces/{workspace_id}/scenes/{scene_id}/{role}/{clean_name}"
    dest_path = storage.local_path(obj_rel_path)
    Path(dest_path).parent.mkdir(parents=True, exist_ok=True)

    # Copy source raster
    import shutil
    shutil.copy2(str(sample_tif), dest_path)

    # Extract metadata and detect modality
    meta = read_metadata(dest_path)
    modality_info = detect_modality(meta)
    modality_label = modality_info["modality"]

    # Previews
    preview_rel_dir = f"workspaces/{workspace_id}/scenes/{scene_id}/previews/{role}"
    preview_disk_dir = storage.local_path(preview_rel_dir)
    generate_previews(meta, dest_path, preview_disk_dir, modality=modality_label)

    preview_obj_path = f"{preview_rel_dir}/preview.png"
    thumb_obj_path = f"{preview_rel_dir}/thumb.png"

    raster_meta = RasterMetadata(**meta)

    scene_image = SceneImage(
        role=role,
        original_filename=clean_name,
        object_path=obj_rel_path,
        metadata=raster_meta,
        modality=ModalityResult(**modality_info),
        preview_path=preview_obj_path,
        thumb_path=thumb_obj_path,
        preview_url=storage.public_url(preview_obj_path),
        thumb_url=storage.public_url(thumb_obj_path),
    )

    compat = CompatibilityReport(
        verdict="PASS",
        checks=[
            CheckItem(name="image_count", status="PASS", detail="1 image(s) provided, 1 expected for SINGLE"),
            CheckItem(name="modality_pairing", status="PASS", detail=f"Detected [{modality_label}]; valid single-image input"),
        ],
        target_crs=raster_meta.crs or "EPSG:4326",
        target_gsd_m=raster_meta.gsd_m or 10.0,
    )

    scene = Scene(
        id=scene_id,
        workspace_id=workspace_id,
        # Named after the file that was actually seeded.  A fixed label like
        # "VRSBench Sample — Scene 0042" mislabels whatever raster is really
        # there, which is worse than no name at all.
        name=Path(clean_name).stem,
        input_config="SINGLE",
        benchmark_mode=not raster_meta.georeferenced,
        images=[scene_image],
        compatibility=compat,
        modalities=[modality_label],
        created_at=datetime.now(timezone.utc).isoformat(),
    )

    db.set_document("scenes", scene_id, scene.model_dump())
    log.info("Successfully seeded demo scene scn_single_01 in satquery.db!")
