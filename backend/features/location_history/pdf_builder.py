"""
Location History & Context Research PDF Report Generator — Feature F12.

Builds an official-grade, multi-section PDF dossier for geographic location
history, disaster annals, and municipal development records.
"""
from __future__ import annotations

import html
import logging
from datetime import datetime, timezone
from typing import Optional

from features.location_history.models import HistoricalContextReport
from services.reporting.report_builder import _render_pdf

log = logging.getLogger(__name__)


def generate_location_history_pdf(report: HistoricalContextReport) -> bytes:
    """
    Render a comprehensive, official-format PDF dossier from a HistoricalContextReport.
    """
    overview = report.overview
    dev = report.development_summary
    ctx = report.context_analysis
    now_str = datetime.now(timezone.utc).strftime("%d %B %Y, %H:%M UTC")

    # Format bounds
    bounds_str = "N/A"
    if overview.bounds_wgs84 and len(overview.bounds_wgs84) == 4:
        w, s, e, n = overview.bounds_wgs84
        bounds_str = f"[{w:.4f}° E, {s:.4f}° N] to [{e:.4f}° E, {n:.4f}° N]"

    centroid_str = "N/A"
    if overview.centroid and len(overview.centroid) == 2:
        lon, lat = overview.centroid
        centroid_str = f"{lat:.5f}° N, {lon:.5f}° E"

    # Build timeline rows HTML
    timeline_rows_html = ""
    for item in report.timeline:
        cat_badge = item.category.replace("_", " ").title()
        spatial_badge = item.spatial_relevance.replace("_", " ").title()
        sources_ref = ", ".join(item.source_ids) if item.source_ids else "Official Records"

        timeline_rows_html += f"""
        <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 8px 6px; font-weight: bold; color: #0f172a; vertical-align: top; width: 60px;">
                {item.year}
            </td>
            <td style="padding: 8px 6px; vertical-align: top; width: 140px;">
                <div style="font-weight: 600; color: #1e293b; font-size: 9pt;">{html.escape(item.title)}</div>
                <div style="font-size: 8pt; color: #64748b; margin-top: 2px;">
                    <span style="background-color: #f1f5f9; padding: 1px 4px; border-radius: 2px;">{cat_badge}</span>
                    <span style="background-color: #e0f2fe; color: #0369a1; padding: 1px 4px; border-radius: 2px; margin-left: 3px;">{spatial_badge}</span>
                </div>
            </td>
            <td style="padding: 8px 6px; color: #334155; font-size: 8.5pt; vertical-align: top;">
                {html.escape(item.description)}
                <div style="font-size: 7.5pt; color: #94a3b8; margin-top: 4px;">Ref: {html.escape(sources_ref)}</div>
            </td>
        </tr>
        """

    # Build sources rows HTML
    sources_rows_html = ""
    for idx, s in enumerate(report.sources, 1):
        url_display = f"<a href='{s.url}' style='color: #0284c7; text-decoration: none;'>{html.escape(s.url)}</a>" if s.url else "Archival Record"
        sources_rows_html += f"""
        <div style="margin-bottom: 10px; padding: 8px 10px; background-color: #f8fafc; border-left: 3px solid #0284c7; border-radius: 2px;">
            <div style="font-weight: 600; font-size: 9pt; color: #0f172a;">[{s.id}] {html.escape(s.title)}</div>
            <div style="font-size: 8pt; color: #475569; margin: 2px 0;">
                <strong>Publisher:</strong> {html.escape(s.publisher)} | <strong>Date:</strong> {html.escape(s.date or 'N/A')} | <strong>Type:</strong> {s.source_type.title()}
            </div>
            <div style="font-size: 8pt; color: #334155; font-style: italic; margin-top: 3px;">
                "{html.escape(s.excerpt)}"
            </div>
            <div style="font-size: 7.5pt; color: #64748b; margin-top: 2px;">Link: {url_display}</div>
        </div>
        """

    # Full HTML template styled for print / PDF output
    html_content = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Location Context Report - {html.escape(overview.location_name)}</title>
<style>
    @page {{
        size: A4 portrait;
        margin: 16mm 14mm 16mm 14mm;
    }}
    body {{
        font-family: Helvetica, Arial, sans-serif;
        color: #1e293b;
        font-size: 9pt;
        line-height: 1.45;
        margin: 0;
        padding: 0;
    }}
    .header-table {{
        width: 100%;
        border-bottom: 2px solid #0f766e;
        padding-bottom: 10px;
        margin-bottom: 14px;
    }}
    .doc-title {{
        font-size: 14pt;
        font-weight: bold;
        color: #0f766e;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }}
    .doc-subtitle {{
        font-size: 8.5pt;
        color: #475569;
        margin-top: 2px;
    }}
    .badge {{
        display: inline-block;
        padding: 3px 7px;
        border-radius: 3px;
        font-size: 7.5pt;
        font-weight: bold;
        text-transform: uppercase;
    }}
    .badge-gov {{
        background-color: #f0fdf4;
        color: #166534;
        border: 1px solid #bbf7d0;
    }}
    .section-title {{
        font-size: 10.5pt;
        font-weight: bold;
        color: #0f172a;
        border-bottom: 1.5px solid #cbd5e1;
        padding-bottom: 4px;
        margin-top: 14px;
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.3px;
    }}
    .meta-box {{
        background-color: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 4px;
        padding: 8px 12px;
        margin-bottom: 12px;
    }}
    .meta-table {{
        width: 100%;
        font-size: 8.5pt;
    }}
    .meta-table td {{
        padding: 3px 0;
        vertical-align: top;
    }}
    .meta-label {{
        font-weight: bold;
        color: #475569;
        width: 130px;
    }}
    .meta-value {{
        color: #0f172a;
    }}
    .timeline-table {{
        width: 100%;
        border-collapse: collapse;
        margin-top: 6px;
    }}
    .timeline-table th {{
        background-color: #f1f5f9;
        color: #475569;
        text-align: left;
        padding: 6px;
        font-size: 8pt;
        text-transform: uppercase;
        border-bottom: 1px solid #cbd5e1;
    }}
    .pillar-card {{
        background-color: #ffffff;
        border: 1px solid #e2e8f0;
        border-left: 3.5px solid #0f766e;
        border-radius: 3px;
        padding: 8px 10px;
        margin-bottom: 8px;
    }}
    .pillar-title {{
        font-weight: bold;
        color: #0f766e;
        font-size: 9pt;
        margin-bottom: 3px;
    }}
    .pillar-desc {{
        color: #334155;
        font-size: 8.5pt;
        text-align: justify;
    }}
    .caveat-box {{
        background-color: #fffbeb;
        border: 1px solid #fef3c7;
        border-left: 3px solid #d97706;
        padding: 8px 10px;
        border-radius: 3px;
        margin-top: 10px;
        font-size: 8pt;
        color: #92400e;
    }}
    .page-break {{
        page-break-after: always;
    }}
</style>
</head>
<body>

<!-- Header -->
<table class="header-table">
    <tr>
        <td>
            <div class="doc-title">Geospatial Context & Historical Intelligence Dossier</div>
            <div class="doc-subtitle">Government & Municipal Archive Grounding • Multi-Source Earth Observation Analysis</div>
        </td>
        <td style="text-align: right; vertical-align: middle;">
            <span class="badge badge-gov">Official Record</span>
            <div style="font-size: 7.5pt; color: #64748b; margin-top: 4px;">ID: {report.id}</div>
        </td>
    </tr>
</table>

<!-- Geographic Overview -->
<div class="meta-box">
    <table class="meta-table">
        <tr>
            <td class="meta-label">Location / Target:</td>
            <td class="meta-value"><strong>{html.escape(overview.location_name)}</strong></td>
            <td class="meta-label">Generated Date:</td>
            <td class="meta-value">{now_str}</td>
        </tr>
        <tr>
            <td class="meta-label">District & State:</td>
            <td class="meta-value">{html.escape(overview.district)}, {html.escape(overview.state)} ({html.escape(overview.country)})</td>
            <td class="meta-label">Period Investigated:</td>
            <td class="meta-value">{html.escape(overview.period_analysed)}</td>
        </tr>
        <tr>
            <td class="meta-label">Centroid Coordinates:</td>
            <td class="meta-value">{centroid_str}</td>
            <td class="meta-label">Topics Explored:</td>
            <td class="meta-value">{html.escape(', '.join(overview.topics) if overview.topics else 'Infrastructure, Disasters, Urban Development')}</td>
        </tr>
        <tr>
            <td class="meta-label">Spatial Bounding Box:</td>
            <td class="meta-value" colspan="3">{bounds_str}</td>
        </tr>
    </table>
</div>

<!-- Executive Summary -->
<div class="section-title">1. Executive Summary & Geospatial Context</div>
<p style="text-align: justify; color: #1e293b; font-size: 9pt; margin-top: 4px;">
    {html.escape(ctx.summary)}
</p>

<!-- Development Evolution Across Key Pillars -->
<div class="section-title">2. Sector-by-Sector Historical Development Matrix</div>

<div class="pillar-card">
    <div class="pillar-title">Urban Expansion & Built Environment</div>
    <div class="pillar-desc">{html.escape(dev.urban_expansion)}</div>
</div>

<div class="pillar-card">
    <div class="pillar-title">Infrastructure & Transportation Networks</div>
    <div class="pillar-desc">{html.escape(dev.infrastructure_evolution)}</div>
</div>

<div class="pillar-card">
    <div class="pillar-title">Hydrological, Flood & Environmental Records</div>
    <div class="pillar-desc">{html.escape(dev.environmental_record)}</div>
</div>

<div class="pillar-card">
    <div class="pillar-title">Agricultural Transition & Land-Use Dynamics</div>
    <div class="pillar-desc">{html.escape(dev.agricultural_transition)}</div>
</div>

<div class="page-break"></div>

<!-- Chronological Timeline -->
<div class="section-title">3. Chronological Historical Timeline & Major Events</div>
<table class="timeline-table">
    <thead>
        <tr>
            <th>Year</th>
            <th>Event / Milestone</th>
            <th>Historical & Spatial Significance</th>
        </tr>
    </thead>
    <tbody>
        {timeline_rows_html}
    </tbody>
</table>

<!-- Interpretation Notes & Methodological Caveat -->
<div class="section-title" style="margin-top: 16px;">4. Satellite Interpretation Guidance & Non-Causal Framing</div>
<p style="text-align: justify; color: #334155; font-size: 8.5pt;">
    {html.escape(ctx.interpretation_notes)}
</p>

<div class="caveat-box">
    <strong>Methodological Notice & Scientific Standard:</strong><br>
    {html.escape(ctx.methodological_caveat)}
</div>

<!-- Sources & Bibliography -->
<div class="section-title" style="margin-top: 16px;">5. Authoritative Institutional Citations & Bibliography</div>
{sources_rows_html}

<!-- Footer Disclaimer -->
<div style="margin-top: 20px; padding-top: 10px; border-top: 1px solid #cbd5e1; font-size: 7.5pt; color: #94a3b8; text-align: center;">
    This dossier was compiled by SatQuery AI Geospatial Intelligence System from peer-reviewed municipal gazetteers, government survey annals, and state remote sensing datasets.
</div>

</body>
</html>
"""

    pdf_bytes = _render_pdf(html_content)
    log.info("Location context PDF report generated (%d bytes) for %s", len(pdf_bytes), overview.location_name)
    return pdf_bytes
