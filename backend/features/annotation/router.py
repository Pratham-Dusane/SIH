"""
Annotation API Router — Extensions PRD §5 & §16.
"""
from datetime import datetime, timezone
import os
import uuid
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import JSONResponse

from core.features import require
from features.annotation.models import (
    AnnotationLayer,
    AnnotationShape,
    AnnotationCreateRequest,
)
from services.annotation.geometry import norm_to_geo, shapes_to_mask

router = APIRouter(tags=["annotations"])

# In-memory storage for annotations: scene_id -> List[AnnotationLayer]
_SCENE_LAYERS: Dict[str, List[AnnotationLayer]] = {}


@router.get("/api/scenes/{scene_id}/annotations", dependencies=[Depends(require("annotation"))], response_model=List[AnnotationLayer])
async def list_annotations(scene_id: str):
    """List all annotation layers for a scene."""
    return _SCENE_LAYERS.get(scene_id, [])


@router.post("/api/scenes/{scene_id}/annotations", dependencies=[Depends(require("annotation"))], response_model=AnnotationLayer)
async def create_annotation_layer(scene_id: str, payload: AnnotationLayer):
    """Create or update an annotation layer for a scene."""
    layers = _SCENE_LAYERS.setdefault(scene_id, [])
    now = datetime.now(timezone.utc).isoformat()

    # If layer ID already exists, update in-place
    existing_idx = next((i for i, l in enumerate(layers) if l.id == payload.id), -1)
    if existing_idx >= 0:
        payload.updated_at = now
        layers[existing_idx] = payload
        return payload

    if not payload.id:
        payload.id = f"layer_{uuid.uuid4().hex[:8]}"
    payload.scene_id = scene_id
    payload.created_at = now
    payload.updated_at = now
    layers.append(payload)
    return payload


@router.patch("/api/annotations/{layer_id}", dependencies=[Depends(require("annotation"))], response_model=AnnotationLayer)
async def update_annotation_layer(layer_id: str, partial: Dict[str, Any]):
    """Update layer properties or shapes."""
    for scene_id, layers in _SCENE_LAYERS.items():
        for i, layer in enumerate(layers):
            if layer.id == layer_id:
                data = layer.model_dump()
                data.update(partial)
                data["updated_at"] = datetime.now(timezone.utc).isoformat()
                updated = AnnotationLayer(**data)
                layers[i] = updated
                return updated
    raise HTTPException(status_code=404, detail=f"Annotation layer '{layer_id}' not found")


@router.delete("/api/annotations/{layer_id}", dependencies=[Depends(require("annotation"))])
async def delete_annotation_layer(layer_id: str):
    """Delete an annotation layer."""
    for scene_id, layers in _SCENE_LAYERS.items():
        for i, layer in enumerate(layers):
            if layer.id == layer_id:
                layers.pop(i)
                return {"status": "deleted", "layer_id": layer_id}
    raise HTTPException(status_code=404, detail=f"Annotation layer '{layer_id}' not found")


@router.get("/api/annotations/{layer_id}.geojson", dependencies=[Depends(require("annotation"))])
async def export_geojson(layer_id: str):
    """Export an annotation layer as EPSG:4326 GeoJSON FeatureCollection."""
    target_layer = None
    target_scene_id = None
    for scene_id, layers in _SCENE_LAYERS.items():
        for layer in layers:
            if layer.id == layer_id:
                target_layer = layer
                target_scene_id = scene_id
                break

    if not target_layer:
        raise HTTPException(status_code=404, detail=f"Annotation layer '{layer_id}' not found")

    from core.db import get_db
    db = get_db()
    scene = db.get_document("scenes", target_scene_id) if hasattr(db, "get_document") else None
    bounds = [0.0, 0.0, 1.0, 1.0]
    if scene and "images" in scene and scene["images"]:
        m = scene["images"][0].get("metadata", {})
        if m.get("bounds_wgs84"):
            bounds = m["bounds_wgs84"]

    features = []
    for idx, shape in enumerate(target_layer.shapes):
        geo_pts = [norm_to_geo(p, bounds) for p in shape.points]
        if shape.kind == "point":
            geom = {"type": "Point", "coordinates": geo_pts[0] if geo_pts else [0, 0]}
        else:
            geom = {"type": "Polygon", "coordinates": [geo_pts]}

        features.append({
            "type": "Feature",
            "properties": {
                "id": shape.id,
                "layer_id": target_layer.id,
                "layer_name": target_layer.name,
                "author": target_layer.author,
                "kind": shape.kind,
                "badge_index": idx + 1,
                "label": shape.label or shape.text or "",
            },
            "geometry": geom,
        })

    return {
        "type": "FeatureCollection",
        "features": features,
    }


@router.post("/api/annotations/{layer_id}/rasterize", dependencies=[Depends(require("annotation"))])
async def rasterize_layer(layer_id: str):
    """Rasterize vector shapes to binary mask PNG for tool consumption."""
    target_layer = None
    target_scene_id = None
    for scene_id, layers in _SCENE_LAYERS.items():
        for layer in layers:
            if layer.id == layer_id:
                target_layer = layer
                target_scene_id = scene_id
                break

    if not target_layer:
        raise HTTPException(status_code=404, detail=f"Annotation layer '{layer_id}' not found")

    width, height = 1024, 1024
    from core.db import get_db
    db = get_db()
    scene = db.get_document("scenes", target_scene_id) if hasattr(db, "get_document") else None
    if scene and "images" in scene and scene["images"]:
        m = scene["images"][0].get("metadata", {})
        width = m.get("width", 1024)
        height = m.get("height", 1024)

    mask = shapes_to_mask([s.model_dump() for s in target_layer.shapes], width, height)

    out_dir = os.path.join("./_data", "artifacts", "annotations")
    os.makedirs(out_dir, exist_ok=True)
    mask_path = os.path.join(out_dir, f"{layer_id}_mask.png")

    try:
        from PIL import Image
        img = Image.fromarray(mask)
        img.save(mask_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to rasterize mask: {e}")

    return {
        "layer_id": layer_id,
        "mask_path": mask_path,
        "width": width,
        "height": height,
        "shape_count": len(target_layer.shapes),
    }
