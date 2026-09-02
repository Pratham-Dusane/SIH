"""
Location History & Context Research Tool — Feature F12.

Dedicated analytical tool that retrieves external historical, infrastructural,
and disaster records for a geographic region to contextualize satellite observations.
"""

from typing import Any, Dict, List, Optional
from pydantic import Field

from tools.base import InputConfig, Tool, ToolParams, ToolResult
from tools.registry import register
from features.location_history.service import research_location_history


class LocationHistoryParams(ToolParams):
    location: Optional[str] = Field(None, description="Named city or district (e.g. 'Pune', 'Bengaluru'). If omitted, inferred from scene AOI.")
    bbox: Optional[List[float]] = Field(None, description="Bounding box [west, south, east, north] in EPSG:4326.")
    date_range: Optional[str] = Field("2000-2026", description="Historical period window (e.g. '2010-2025').")
    topic: Optional[str] = Field("infrastructure, flooding, urban development", description="Focus topic areas.")
    max_results: Optional[int] = Field(6, description="Maximum number of timeline events to extract.")


@register
class LocationHistoryTool(Tool):
    name = "location_history"
    description = (
        "Retrieve documented historical events, infrastructure projects, and disaster records "
        "for a geographic area to contextualize observed land use and surface changes."
    )
    accepts: List[InputConfig] = ["SINGLE", "CROSS_MODAL", "BI_TEMPORAL"]
    required_modalities: List[str] = []
    params_model = LocationHistoryParams
    produces = ["text", "stats"]
    offline_capable = True

    async def run(self, ctx: Any, params: LocationHistoryParams) -> ToolResult:
        scene = ctx.scene
        scene_id = scene.id if hasattr(scene, "id") else str(scene)

        # Research historical context
        report = await research_location_history(
            location=params.location,
            bbox=params.bbox,
            date_range=params.date_range or "2000-2026",
            topic=params.topic or "infrastructure, flooding, urban development",
            scene_id=scene_id,
        )

        timeline_items = report.timeline[: params.max_results or 6]

        # Build clean formatted report
        lines = [
            f"**Historical & Contextual Record: {report.overview.location_name}** ({report.overview.period_analysed})\n",
            f"**Context Summary:** {report.context_analysis.summary}\n",
            "**Key Historical Milestones:**",
        ]

        for ev in timeline_items:
            lines.append(f"- **{ev.year} ({ev.date_str}):** {ev.title} — {ev.description}")

        lines.append(f"\n**Analytical Interpretation:** {report.context_analysis.interpretation_notes}")
        lines.append(f"\n*(Note: {report.context_analysis.methodological_caveat})*")

        facts = {
            "location": report.overview.location_name,
            "district": report.overview.district,
            "state": report.overview.state,
            "event_count": len(report.timeline),
            "period": report.overview.period_analysed,
            "sources_cited": len(report.sources),
        }

        artifacts = {
            "timeline": [ev.model_dump() for ev in timeline_items],
            "sources": [s.model_dump() for s in report.sources],
            "overview": report.overview.model_dump(),
        }

        return ToolResult(
            tool=self.name,
            text="\n".join(lines),
            confidence=0.92,
            confidence_basis="authoritative_gazetteer_and_administrative_annals",
            facts=facts,
            artifacts=artifacts,
        )
