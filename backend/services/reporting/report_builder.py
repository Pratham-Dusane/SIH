"""
Report Builder — PRD §10.4 (Phase 7).

Generates a 7-section PDF report using Jinja2 templating + WeasyPrint.
Falls back to xhtml2pdf if WeasyPrint is not installed (avoids GTK
native-library dependency on Windows dev machines).

Report sections (all mandatory — §10.4, R11/R13):
  1. Cover                — scene name, date, input config, thumbnails
  2. Query & Answer       — verbatim query, final answer, confidence band
  3. Input Validation     — full compatibility checklist (pass/warn/fail)
  4. Evidence             — each layer rendered over preview + stats table
  5. Execution Summary    — trace table (step, tool, model, params, duration, confidence)
  6. Model Provenance     — model card for every model that ran
  7. Appendix             — full metadata for each input image

Sections 3, 5 and 6 are R11-graded — do not remove for aesthetics.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

log = logging.getLogger(__name__)

TEMPLATE_DIR = Path(__file__).parent / "templates"


# ---------------------------------------------------------------------------
# PDF rendering backend — try WeasyPrint, fall back to xhtml2pdf
# ---------------------------------------------------------------------------

def _render_pdf(html_string: str, base_url: Optional[str] = None) -> bytes:
    """
    Render HTML to PDF bytes.

    Tries WeasyPrint first (best quality, requires GTK/Cairo on Windows).
    Falls back to xhtml2pdf (pure Python, slightly lower fidelity).
    """
    # --- WeasyPrint ---
    try:
        from weasyprint import HTML as WeasyHTML
        return WeasyHTML(string=html_string, base_url=base_url).write_pdf()
    except ImportError:
        pass
    except Exception as exc:
        log.warning("WeasyPrint render failed (%s); falling back to xhtml2pdf", exc)

    # --- xhtml2pdf fallback ---
    try:
        import io
        from xhtml2pdf import pisa

        buf = io.BytesIO()
        pisa_status = pisa.CreatePDF(html_string, dest=buf)
        if not pisa_status.err:
            return buf.getvalue()
        log.error("xhtml2pdf render error: %s", pisa_status.err)
    except ImportError:
        pass

    # --- Plain bytes fallback (should never happen in prod) ---
    log.error("No PDF renderer available (install weasyprint or xhtml2pdf)")
    placeholder = (
        b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj "
        b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj "
        b"3 0 obj<</Type/Page/MediaBox[0 0 595 842]>>endobj\n"
        b"xref\n0 4\n0000000000 65535 f\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n9\n%%EOF"
    )
    return placeholder


# ---------------------------------------------------------------------------
# Jinja2 template loader
# ---------------------------------------------------------------------------

def _get_template(name: str = "report.html"):
    """Load a Jinja2 template from the templates/ directory."""
    try:
        from jinja2 import Environment, FileSystemLoader, select_autoescape
        env = Environment(
            loader=FileSystemLoader(str(TEMPLATE_DIR)),
            autoescape=select_autoescape(["html"]),
        )
        return env.get_template(name)
    except ImportError as exc:
        raise RuntimeError("jinja2 is required for report generation. "
                           "Run: pip install jinja2") from exc


# ---------------------------------------------------------------------------
# Registry card helper
# ---------------------------------------------------------------------------

def _registry_card(model_id: Optional[str]) -> Optional[Dict[str, Any]]:
    """
    Return a model card dict for a given model_id string.
    Falls back to a minimal card with the id only so the report always has
    something in Section 6 even when no registry is configured.
    """
    if not model_id:
        return None
    # Minimal card — extend when a proper model registry exists
    cards = {
        "gemini-3.6-flash":   {"name": "Gemini 3.6 Flash",   "provider": "Google Vertex AI",  "type": "VLM",          "offline_capable": False},
        "gemini-3.5-flash":   {"name": "Gemini 3.5 Flash",   "provider": "Google Vertex AI",  "type": "VLM",          "offline_capable": False},
        "gpt-4o":             {"name": "GPT-4o",              "provider": "OpenAI",            "type": "VLM",          "offline_capable": False},
        "claude-sonnet-5":    {"name": "Claude Sonnet 5",     "provider": "Anthropic",         "type": "VLM",          "offline_capable": False},
        "spectral_index":     {"name": "Spectral Index",      "provider": "Deterministic/rasterio", "type": "Tool",    "offline_capable": True},
        "sar_water_mask":     {"name": "SAR Water Mask",      "provider": "Deterministic/numpy",    "type": "Tool",    "offline_capable": True},
        "change_detect":      {"name": "Change Detect",       "provider": "GEE / deterministic",   "type": "Tool",     "offline_capable": False},
        "geo_stats":          {"name": "Geo Stats",           "provider": "Deterministic/rasterio", "type": "Tool",    "offline_capable": True},
        "coreg_check":        {"name": "Co-registration Check","provider": "Deterministic/skimage","type": "Tool",     "offline_capable": True},
    }
    card = cards.get(model_id, {"name": model_id, "provider": "Unknown", "type": "Unknown", "offline_capable": None})
    return {"model_id": model_id, **card}


# ---------------------------------------------------------------------------
# Evidence item builder
# ---------------------------------------------------------------------------

def _build_evidence_items(
    evidence: Dict[str, Any],
    query_id: str,
    base_url: str = "",
) -> List[Dict[str, Any]]:
    """
    Convert the raw evidence dict from QueryResult into structured items
    matching the PRD §10.3 contract for the report template.

    Each item has:
      id, type, label, colour, png_url, geotiff_url, geojson_url, stats
    """
    from services.evidence.overlay_renderer import colour_for_layer

    items = []
    for ev_id, (ev_key, ev_val) in enumerate(evidence.items()):
        # Infer layer type from key name
        layer_type = "mask"
        for t in ("water", "change", "built_up", "boxes", "conflict"):
            if t in ev_key.lower():
                layer_type = t
                break

        label = ev_key.replace(".", " › ").replace("_", " ").title()
        colour = colour_for_layer(layer_type)

        item: Dict[str, Any] = {
            "id": f"ev{ev_id + 1}",
            "type": layer_type,
            "label": label,
            "colour": colour,
            "source_step": ev_key.split(".")[0] if "." in ev_key else ev_key,
            "png_url": f"{base_url}/api/queries/{query_id}/export/evidence/{ev_key}/png",
            "geotiff_url": f"{base_url}/api/queries/{query_id}/export/evidence/{ev_key}/geotiff",
            "geojson_url": f"{base_url}/api/queries/{query_id}/export/evidence/{ev_key}/geojson",
            "stats": ev_val if isinstance(ev_val, dict) else {},
        }
        items.append(item)
    return items


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_report(
    query_result: Any,
    scene: Any,
    query_id: str,
    *,
    out_path: Optional[str] = None,
    base_url: str = "",
) -> bytes:
    """
    Build the 7-section PDF report — PRD §10.4.

    Parameters
    ----------
    query_result:  QueryResult object (answer, confidence, evidence, trace)
    scene:         Scene object (name, images, compatibility, metadata)
    query_id:      The persisted query ID (used to construct download URLs)
    out_path:      If given, also write the PDF to disk at this path
    base_url:      API base URL for building evidence download links

    Returns
    -------
    PDF bytes.
    """
    template = _get_template("report.html")

    trace = getattr(query_result, "trace", None)
    confidence = getattr(query_result, "confidence", None)
    evidence = getattr(query_result, "evidence", {}) or {}

    # Collect model cards for every model that ran
    model_ids_seen: set = set()
    if trace and getattr(trace, "steps", None):
        for step in trace.steps:
            if step.model:
                model_ids_seen.add(step.model)
    model_cards = [c for c in (_registry_card(m) for m in model_ids_seen) if c]

    # Build evidence items
    evidence_items = _build_evidence_items(evidence, query_id, base_url)

    # Scene thumbnail as base64 data URIs (avoids self-referential HTTP calls during PDF render)
    import base64
    from core.storage import get_storage
    storage = get_storage()
    image_previews = []
    images = getattr(scene, "images", []) or []
    for img in images:
        data_uri = None
        preview_p = getattr(img, "preview_path", None)
        if preview_p:
            try:
                local_p = storage.local_path(preview_p)
                if os.path.exists(local_p):
                    with open(local_p, "rb") as img_f:
                        b64 = base64.b64encode(img_f.read()).decode("utf-8")
                        mime = "image/jpeg" if local_p.lower().endswith((".jpg", ".jpeg")) else "image/png"
                        data_uri = f"data:{mime};base64,{b64}"
            except Exception as exc:
                log.warning("Could not encode preview %s: %s", preview_p, exc)
        image_previews.append({"role": getattr(img, "role", "image"), "data_uri": data_uri})

    # Compatibility checks for Section 3
    compat_checks = []
    compat = getattr(scene, "compatibility", None)
    if compat and hasattr(compat, "checks"):
        compat_checks = [c.model_dump() if hasattr(c, "model_dump") else dict(c)
                         for c in (compat.checks or [])]

    html = template.render(
        scene=scene,
        result=query_result,
        query_id=query_id,
        trace=trace,
        trace_dict=trace.model_dump() if trace and hasattr(trace, "model_dump") else {},
        confidence=confidence,
        evidence_items=evidence_items,
        model_cards=model_cards,
        image_previews=image_previews,
        compat_checks=compat_checks,
        images=images,
        generated_at=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        base_url=base_url,
    )

    pdf_bytes = _render_pdf(html, base_url=base_url or None)

    if out_path:
        Path(out_path).parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "wb") as f:
            f.write(pdf_bytes)
        log.info("Report written to %s (%d bytes)", out_path, len(pdf_bytes))

    return pdf_bytes


def build_answer_markdown(query_result: Any, scene: Any) -> str:
    """
    Generate the answer.md artifact — PRD §10.5.

    A lightweight markdown file with the verbatim query, final answer,
    and confidence band.  Useful for CI diff and documentation.
    """
    confidence = getattr(query_result, "confidence", None)
    trace = getattr(query_result, "trace", None)
    scene_name = getattr(scene, "name", getattr(scene, "id", "unknown"))

    lines = [
        "# SatQuery AI — Query Answer",
        "",
        f"**Scene:** {scene_name}",
        f"**Generated:** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
    ]
    if trace:
        lines.append(f"**Trace ID:** `{getattr(trace, 'trace_id', 'n/a')}`")
    lines += [
        "",
        "## Query",
        "",
        f"> {getattr(trace, 'query', '') if trace else ''}",
        "",
        "## Answer",
        "",
        getattr(query_result, "answer", ""),
        "",
    ]
    if confidence:
        lines += [
            "## Confidence",
            "",
            f"**Band:** {getattr(confidence, 'band', 'N/A')}  ",
            f"**Value:** {getattr(confidence, 'value', 0):.1%}  ",
            f"**Basis:** {getattr(confidence, 'basis', '')}",
            "",
        ]
    if getattr(query_result, "refused", False):
        lines += ["---", "", "_Query was refused by the input gate._", ""]
    return "\n".join(lines)
