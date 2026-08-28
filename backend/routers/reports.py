"""
Reports / Export Router — PRD §10.5, §14 (Phase 7).

Endpoints:
  GET /api/queries/{id}/export/bundle         → ZIP (all artifacts)
  GET /api/queries/{id}/export/report         → PDF
  GET /api/queries/{id}/export/trace          → JSON
  GET /api/queries/{id}/export/answer         → Markdown
  GET /api/queries/{id}/export/evidence/{key}/geotiff  → GeoTIFF
  GET /api/queries/{id}/export/evidence/{key}/geojson  → GeoJSON
  GET /api/queries/{id}/export/evidence/{key}/png      → PNG overlay

Individual artifact endpoints exist so QGIS users can pull a single
GeoTIFF without downloading the full ZIP bundle (PRD §10.5).
"""

from __future__ import annotations

import io
import json
import logging
import os
import tempfile
import zipfile
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse

from core.auth import current_user
from core.config import settings
from core.db import Database, get_db
from core.storage import Storage, get_storage

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/queries", tags=["reports"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_query(query_id: str, db: Database):
    """Load a persisted query record or raise 404."""
    record = db.get_document("queries", query_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"Query '{query_id}' not found")
    return record


def _load_trace(query_id: str, trace_id: Optional[str], db: Database) -> Optional[dict]:
    """Load the execution trace for a query."""
    if not trace_id:
        return None
    return db.get_document("traces", trace_id)


def _load_scene(scene_id: str, db: Database):
    """Load a scene record or raise 404."""
    record = db.get_document("scenes", scene_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"Scene '{scene_id}' not found")
    from models.scene import Scene
    return Scene(**record)


def _try_load_mask(
    evidence_key: str,
    scene_id: str,
    workspace_id: str,
    storage: Storage,
) -> Optional[tuple]:
    """
    Attempt to load a binary mask from storage.

    Returns (mask_array, transform, crs) or None if the artifact is not a
    raster on disk (e.g. it's just a text summary or the file is absent).
    """
    try:
        import rasterio
        artifact_rel = (
            f"workspaces/{workspace_id}/scenes/{scene_id}"
            f"/artifacts/{evidence_key.replace('.', '_')}.tif"
        )
        local_path = storage.local_path(artifact_rel)
        if not os.path.exists(local_path):
            return None
        with rasterio.open(local_path) as src:
            mask = src.read(1)
            transform = src.transform
            crs = src.crs
        return mask, transform, crs
    except Exception as exc:
        log.debug("Could not load mask for %s: %s", evidence_key, exc)
        return None


def _build_query_result_stub(record: dict, trace_dict: Optional[dict]):
    """
    Build a minimal QueryResult-like object from DB record + trace dict.
    Used for report generation without re-running the pipeline.
    """
    from types import SimpleNamespace
    from agent.trace import Confidence

    confidence = None
    if record.get("confidence"):
        c = record["confidence"]
        try:
            confidence = Confidence(**c)
        except Exception:
            pass

    result = SimpleNamespace(
        answer=record.get("answer", ""),
        refused=record.get("refused", False),
        evidence=record.get("evidence", {}),
        confidence=confidence,
        trace=None,
        verification=None,
        refusal=None,
    )

    if trace_dict:
        from agent.trace import ExecutionTrace
        try:
            result.trace = ExecutionTrace(**trace_dict)
        except Exception:
            pass

    return result


# ---------------------------------------------------------------------------
# Individual artifact endpoints
# ---------------------------------------------------------------------------

@router.get("/{query_id}/export/trace")
def export_trace(
    query_id: str,
    _user: dict = Depends(current_user),
    db: Database = Depends(get_db),
):
    """
    Download the ExecutionTrace JSON for a completed query — PRD §10.5.

    This is the R11-graded artifact: a machine-readable audit of which tool
    ran with which parameters.
    """
    record = _load_query(query_id, db)
    trace_id = record.get("trace_id")
    trace = _load_trace(query_id, trace_id, db)

    if not trace:
        # Fall back to the trace embedded in the query record
        trace = {
            "query_id": query_id,
            "answer": record.get("answer"),
            "confidence": record.get("confidence"),
            "note": "Full trace not available — trace_id was not persisted.",
        }

    return Response(
        content=json.dumps(trace, indent=2, default=str),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="trace_{query_id}.json"',
        },
    )


@router.get("/{query_id}/export/answer")
def export_answer(
    query_id: str,
    _user: dict = Depends(current_user),
    db: Database = Depends(get_db),
):
    """Download the answer.md artifact — PRD §10.5."""
    record = _load_query(query_id, db)
    scene = _load_scene(record.get("scene_id", ""), db)
    trace_dict = _load_trace(query_id, record.get("trace_id"), db)

    result = _build_query_result_stub(record, trace_dict)
    from services.reporting.report_builder import build_answer_markdown
    md = build_answer_markdown(result, scene)

    return Response(
        content=md.encode("utf-8"),
        media_type="text/markdown",
        headers={
            "Content-Disposition": f'attachment; filename="answer_{query_id}.md"',
        },
    )


@router.get("/{query_id}/export/report")
def export_report(
    query_id: str,
    _user: dict = Depends(current_user),
    db: Database = Depends(get_db),
):
    """Download the 7-section PDF analysis report — PRD §10.4."""
    record = _load_query(query_id, db)
    scene = _load_scene(record.get("scene_id", ""), db)
    trace_dict = _load_trace(query_id, record.get("trace_id"), db)

    result = _build_query_result_stub(record, trace_dict)

    try:
        from services.reporting.report_builder import build_report
        pdf_bytes = build_report(
            result,
            scene,
            query_id,
            base_url=settings.API_BASE_URL,
        )
    except Exception as exc:
        log.exception("PDF report generation failed for query %s", query_id)
        raise HTTPException(status_code=500, detail=f"Report generation failed: {exc}") from exc

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="report_{query_id}.pdf"',
        },
    )


@router.get("/{query_id}/export/evidence/{evidence_key:path}/geotiff")
def export_evidence_geotiff(
    query_id: str,
    evidence_key: str,
    _user: dict = Depends(current_user),
    db: Database = Depends(get_db),
    storage: Storage = Depends(get_storage),
):
    """
    Download a single GeoTIFF for a specific evidence layer — PRD §10.5.

    Supports QGIS pull without downloading the full bundle.
    The GeoTIFF has provenance tags (SATQUERY_TRACE, SATQUERY_TOOL) so
    it's self-describing when opened months later.
    """
    record = _load_query(query_id, db)
    workspace_id = record.get("workspace_id", "ws_demo")
    scene_id = record.get("scene_id", "")
    trace_id = record.get("trace_id")

    loaded = _try_load_mask(evidence_key, scene_id, workspace_id, storage)
    if not loaded:
        raise HTTPException(
            status_code=404,
            detail=f"No raster artifact found for evidence key '{evidence_key}'. "
                   "The evidence layer may not have a raster source "
                   "(e.g. it is a text result or boxes overlay).",
        )

    mask, transform, crs = loaded
    with tempfile.NamedTemporaryFile(suffix=".tif", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        from services.evidence.geo_export import write_mask_geotiff
        write_mask_geotiff(
            mask, transform, crs, tmp_path,
            trace_id=trace_id,
            tool_name=evidence_key,
        )
        with open(tmp_path, "rb") as f:
            content = f.read()
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass

    safe_key = evidence_key.replace("/", "_").replace(".", "_")
    return Response(
        content=content,
        media_type="image/tiff",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_key}_{query_id}.tif"',
        },
    )


@router.get("/{query_id}/export/evidence/{evidence_key:path}/geojson")
def export_evidence_geojson(
    query_id: str,
    evidence_key: str,
    _user: dict = Depends(current_user),
    db: Database = Depends(get_db),
    storage: Storage = Depends(get_storage),
):
    """Download a GeoJSON polygon for a specific evidence layer — PRD §10.5."""
    record = _load_query(query_id, db)
    workspace_id = record.get("workspace_id", "ws_demo")
    scene_id = record.get("scene_id", "")
    trace_id = record.get("trace_id")

    loaded = _try_load_mask(evidence_key, scene_id, workspace_id, storage)
    if not loaded:
        raise HTTPException(status_code=404, detail=f"No raster artifact for '{evidence_key}'")

    mask, transform, crs = loaded
    with tempfile.NamedTemporaryFile(suffix=".geojson", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        from services.evidence.geo_export import mask_to_geojson
        mask_to_geojson(
            mask, transform, crs, tmp_path,
            trace_id=trace_id,
            tool_name=evidence_key,
        )
        with open(tmp_path, "r", encoding="utf-8") as f:
            content = f.read()
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass

    safe_key = evidence_key.replace("/", "_").replace(".", "_")
    return Response(
        content=content.encode("utf-8"),
        media_type="application/geo+json",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_key}_{query_id}.geojson"',
        },
    )


@router.get("/{query_id}/export/evidence/{evidence_key:path}/png")
def export_evidence_png(
    query_id: str,
    evidence_key: str,
    _user: dict = Depends(current_user),
    db: Database = Depends(get_db),
    storage: Storage = Depends(get_storage),
):
    """Download the RGBA PNG overlay for a specific evidence layer — PRD §10.1."""
    record = _load_query(query_id, db)
    workspace_id = record.get("workspace_id", "ws_demo")
    scene_id = record.get("scene_id", "")

    loaded = _try_load_mask(evidence_key, scene_id, workspace_id, storage)
    if not loaded:
        raise HTTPException(status_code=404, detail=f"No raster artifact for '{evidence_key}'")

    mask, _transform, _crs = loaded

    # Infer layer type from key name for correct colour
    layer_type = "mask"
    for lt in ("water", "change", "built_up", "boxes", "conflict"):
        if lt in evidence_key.lower():
            layer_type = lt
            break

    from services.evidence.overlay_renderer import render_mask_overlay
    png_bytes = render_mask_overlay(mask, layer_type=layer_type)

    safe_key = evidence_key.replace("/", "_").replace(".", "_")
    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_key}_{query_id}.png"',
        },
    )


# ---------------------------------------------------------------------------
# ZIP bundle — all artifacts in one download
# ---------------------------------------------------------------------------

@router.get("/{query_id}/export/bundle")
def export_bundle(
    query_id: str,
    _user: dict = Depends(current_user),
    db: Database = Depends(get_db),
    storage: Storage = Depends(get_storage),
):
    """
    Download all artifacts as a ZIP bundle — PRD §10.5.

    Bundle structure:
      satquery_{queryId}/
      ├── report.pdf
      ├── trace.json
      ├── answer.md
      ├── evidence/
      │   ├── {key}.tif
      │   ├── {key}.geojson
      │   └── {key}.png
      └── inputs/
          ├── metadata.json
          └── compatibility.json
    """
    record = _load_query(query_id, db)
    scene = _load_scene(record.get("scene_id", ""), db)
    workspace_id = record.get("workspace_id", "ws_demo")
    scene_id = record.get("scene_id", "")
    trace_id = record.get("trace_id")

    trace_dict = _load_trace(query_id, trace_id, db)
    result = _build_query_result_stub(record, trace_dict)

    zip_buf = io.BytesIO()
    prefix = f"satquery_{query_id}"

    with zipfile.ZipFile(zip_buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        # --- trace.json ---
        trace_content = trace_dict or {"query_id": query_id, "note": "Trace not available"}
        zf.writestr(f"{prefix}/trace.json", json.dumps(trace_content, indent=2, default=str))

        # --- answer.md ---
        try:
            from services.reporting.report_builder import build_answer_markdown
            md = build_answer_markdown(result, scene)
            zf.writestr(f"{prefix}/answer.md", md)
        except Exception as exc:
            log.warning("Could not build answer.md: %s", exc)

        # --- report.pdf ---
        try:
            from services.reporting.report_builder import build_report
            pdf = build_report(result, scene, query_id, base_url=settings.API_BASE_URL)
            zf.writestr(f"{prefix}/report.pdf", pdf)
        except Exception as exc:
            log.warning("Could not build report.pdf for bundle: %s", exc)

        # --- inputs/metadata.json ---
        try:
            images_meta = []
            for img in (scene.images or []):
                images_meta.append({
                    "object_path": img.object_path,
                    "role": img.role,
                    "modality": img.modality.modality if img.modality else None,
                    "metadata": img.metadata.model_dump() if img.metadata else {},
                })
            zf.writestr(
                f"{prefix}/inputs/metadata.json",
                json.dumps({"scene_id": scene_id, "images": images_meta}, indent=2, default=str),
            )
        except Exception as exc:
            log.warning("Could not write inputs/metadata.json: %s", exc)

        # --- inputs/compatibility.json ---
        try:
            compat = getattr(scene, "compatibility", None)
            if compat:
                compat_data = compat.model_dump() if hasattr(compat, "model_dump") else {}
            else:
                compat_data = {}
            zf.writestr(
                f"{prefix}/inputs/compatibility.json",
                json.dumps(compat_data, indent=2, default=str),
            )
        except Exception as exc:
            log.warning("Could not write compatibility.json: %s", exc)

        # --- evidence/ ---
        evidence = record.get("evidence") or {}
        for ev_key in evidence.keys():
            loaded = _try_load_mask(ev_key, scene_id, workspace_id, storage)
            if not loaded:
                continue
            mask, transform, crs = loaded
            safe_key = ev_key.replace("/", "_").replace(".", "_")

            # GeoTIFF
            with tempfile.NamedTemporaryFile(suffix=".tif", delete=False) as tmp:
                tmp_tif = tmp.name
            try:
                from services.evidence.geo_export import write_mask_geotiff
                write_mask_geotiff(mask, transform, crs, tmp_tif, trace_id=trace_id, tool_name=ev_key)
                zf.write(tmp_tif, f"{prefix}/evidence/{safe_key}.tif")
            except Exception as exc:
                log.warning("GeoTIFF export failed for %s: %s", ev_key, exc)
            finally:
                try: os.unlink(tmp_tif)
                except Exception: pass

            # GeoJSON
            with tempfile.NamedTemporaryFile(suffix=".geojson", delete=False) as tmp:
                tmp_gj = tmp.name
            try:
                from services.evidence.geo_export import mask_to_geojson
                mask_to_geojson(mask, transform, crs, tmp_gj, trace_id=trace_id, tool_name=ev_key)
                zf.write(tmp_gj, f"{prefix}/evidence/{safe_key}.geojson")
            except Exception as exc:
                log.warning("GeoJSON export failed for %s: %s", ev_key, exc)
            finally:
                try: os.unlink(tmp_gj)
                except Exception: pass

            # PNG overlay
            try:
                layer_type = "mask"
                for lt in ("water", "change", "built_up", "boxes", "conflict"):
                    if lt in ev_key.lower():
                        layer_type = lt
                        break
                from services.evidence.overlay_renderer import render_mask_overlay
                png = render_mask_overlay(mask, layer_type=layer_type)
                zf.writestr(f"{prefix}/evidence/{safe_key}.png", png)
            except Exception as exc:
                log.warning("PNG overlay failed for %s: %s", ev_key, exc)

    zip_buf.seek(0)
    return StreamingResponse(
        zip_buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="satquery_{query_id}.zip"',
        },
    )
