"""
Location History & Context Research service — Feature F12.

Resolves geographic location via AdminLookup, generates targeted historical queries,
retrieves external historical/contextual evidence, filters relevance, and structures
a chronological timeline and grounded contextual report.
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import logging
import re
import uuid
from typing import Any, Dict, List, Optional, Tuple

from core.db import get_db
from core.geo.admin_lookup import get_admin_lookup, AdminUnit
from features.location_history.models import (
    HistoricalContextReport,
    HistoricalDevelopment,
    HistoricalEventCategory,
    HistoricalTimelineItem,
    LocationOverview,
    RelevantHistoricalContext,
    SourceItem,
)

log = logging.getLogger(__name__)

# Cache for location history queries: hash(district, date_range, topic) -> HistoricalContextReport
_HISTORY_CACHE: Dict[str, HistoricalContextReport] = {}


def _get_cache_key(district: str, state: str, date_range: str, topic: str) -> str:
    raw = f"{district.lower().strip()}:{state.lower().strip()}:{date_range.strip()}:{topic.lower().strip()}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def resolve_location(
    location_str: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    bbox: Optional[List[float]] = None,
    scene_id: Optional[str] = None,
) -> Tuple[str, str, Optional[str], Optional[Tuple[float, float]], Optional[List[float]]]:
    """
    Step 1: Resolve location from coordinates, bbox, named place, or scene ID.
    Returns (district, state, unit_id, centroid, bounds_wgs84).
    """
    lookup = get_admin_lookup()
    district = "Pune"
    state = "Maharashtra"
    unit_id = "IN-MH-PUNE"
    centroid = (73.8567, 18.5204)
    bounds = [73.7, 18.4, 74.0, 18.7]

    # 1. If scene_id provided, look up scene bounds
    if scene_id:
        db = get_db()
        scene = db.get_document("scenes", scene_id) if hasattr(db, "get_document") else None
        if scene and "images" in scene and scene["images"]:
            m = scene["images"][0].get("metadata", {})
            b = m.get("bounds_wgs84")
            if b and len(b) == 4:
                bounds = b
                cx = (b[0] + b[2]) / 2.0
                cy = (b[1] + b[3]) / 2.0
                centroid = (round(cx, 6), round(cy, 6))
                admin = lookup.label_for(cx, cy)
                if admin:
                    return admin.district, admin.state, admin.unit_id, centroid, bounds

    # 2. If lat / lon provided
    if lat is not None and lon is not None:
        centroid = (lon, lat)
        bounds = [lon - 0.05, lat - 0.05, lon + 0.05, lat + 0.05]
        admin = lookup.label_for(lon, lat)
        if admin:
            return admin.district, admin.state, admin.unit_id, centroid, bounds

    # 3. If bbox provided
    if bbox and len(bbox) == 4:
        bounds = bbox
        cx = (bbox[0] + bbox[2]) / 2.0
        cy = (bbox[1] + bbox[3]) / 2.0
        centroid = (cx, cy)
        admin = lookup.label_for(cx, cy)
        if admin:
            return admin.district, admin.state, admin.unit_id, centroid, bounds

    # 4. If named location string provided
    if location_str:
        clean = location_str.replace("district", "").replace("city", "").strip()
        hits = lookup.search(clean, limit=1)
        if hits:
            admin = hits[0]
            return admin.district, admin.state, admin.unit_id, admin.centroid, admin.bounds_wgs84

    return district, state, unit_id, centroid, bounds


def generate_search_queries(district: str, state: str, date_range: str, topic: str) -> List[str]:
    """
    Step 2: Construct geographically bounded search queries.

    Deliberately short and keyword-shaped. An earlier version appended the date
    range and the full topic string to every query; against a real search index
    that made them *worse* - "Pune district Maharashtra major flooding and
    natural disaster history 2000-2026" misses the "2019 Pune flood" article
    that plain "Pune flood history" returns first. The window is enforced when
    events are validated, which is where it belongs.
    """
    queries = [
        f"{district} flood history",
        f"{district} {state} urban development",
        f"{district} infrastructure highway metro expressway",
        f"{district} district rivers dams reservoirs",
    ]
    # One query per requested topic, so changing the topics changes what is
    # actually searched rather than only what is echoed back.
    for t in [t.strip() for t in topic.split(",") if t.strip()][:3]:
        queries.append(f"{district} {t}")
    return queries


_YEAR_RE = re.compile(r"(1[89]\d{2}|20\d{2}|21\d{2})")


def _parse_period(period: str) -> Tuple[Optional[int], Optional[int]]:
    """
    Extract (start_year, end_year) from a free-form period string.

    Accepts "2000-2026", "2000 to 2026", "since 2015" and similar. Returns
    (None, None) when no year can be read, in which case no filtering is
    applied rather than silently emptying the timeline.
    """
    if not period:
        return None, None
    years = [int(y) for y in _YEAR_RE.findall(str(period))]
    if not years:
        return None, None
    if len(years) == 1:
        return years[0], None
    return min(years), max(years)


def _template_report(
    district: str,
    state: str,
    period: str,
    topics: List[str],
    centroid: Optional[Tuple[float, float]],
    bounds: Optional[List[float]],
) -> HistoricalContextReport:
    """
    FALLBACK ONLY - a generic regional development template.

    Six fixed events with the district name interpolated in, backed by source
    entries whose publishers, dates, excerpts and URLs are all invented.  None
    of it is researched.

    It is returned only when web retrieval or the extraction model is
    unavailable, so the panel still has something to render.  Every report
    built from it carries `provenance="synthesized"` on the API response, which
    is how a consumer tells it apart from `_researched_report` output.

    Prefer `_researched_report`.
    """
    d_clean = district.lower().strip()
    report_id = f"hist_rep_{uuid.uuid4().hex[:8]}"
    now_iso = datetime.now(timezone.utc).isoformat()

    # Contextual knowledge generation tailored to district
    sources: List[SourceItem] = []
    timeline: List[HistoricalTimelineItem] = []

    # Source references (Official / Gazetteers / Academic)
    sources.append(
        SourceItem(
            id="src_1",
            title=f"Disaster Management & Flood Mitigation Plan — {district} District",
            publisher=f"District Disaster Management Authority (DDMA), Govt of {state}",
            date="2024-03-15",
            url=f"https://{d_clean}.nic.in/disaster-management",
            excerpt=f"Chronological record of monsoon inundation, river catchment management, and flood hazard zonation across {district} basin.",
            source_type="official",
        )
    )
    sources.append(
        SourceItem(
            id="src_2",
            title=f"Comprehensive Mobility & Infrastructure Master Plan (2011–2031)",
            publisher=f"Metropolitan Region Development Authority / Urban Development Dept, {state}",
            date="2022-08-20",
            url=f"https://urban.{state.lower().replace(' ', '')}.gov.in/master-plans",
            excerpt=f"Zonational expansion, ring road arteries, industrial growth clusters, and transit corridors commissioned across {district}.",
            source_type="official",
        )
    )
    sources.append(
        SourceItem(
            id="src_3",
            title=f"Decadal Land Use / Land Cover Dynamics & Urban Sprawl Analysis",
            publisher="Indian Space Research Organisation (ISRO) & NRSC National Land Use Atlas",
            date="2023-11-10",
            url="https://bhoonidhi.nrsc.gov.in/land-cover-atlas",
            excerpt=f"Multi-temporal satellite-derived baseline recording conversion of peri-urban agricultural tracts into built-up infrastructure in {district}.",
            source_type="academic",
        )
    )
    sources.append(
        SourceItem(
            id="src_4",
            title=f"State Water Resources Gazette & Catchment Area Survey",
            publisher=f"Water Resources Department, Government of {state}",
            date="2021-06-05",
            url=f"https://wrd.{state.lower().replace(' ', '')}.gov.in/catchment-data",
            excerpt=f"Annual discharge levels, dam overflow events, and surface water reservoir retention metrics in {district}.",
            source_type="official",
        )
    )

    # Historical timeline synthesis
    timeline.append(
        HistoricalTimelineItem(
            id="evt_2005",
            year=2005,
            date_str="2005-07-26",
            title=f"Severe Monsoon Inundation & Catchment Runoff",
            category="natural_disasters",
            description=f"Exceptional heavy rainfall event resulted in widespread inundation of low-lying floodplains and riparian corridors across {district}.",
            spatial_relevance="direct_aoi",
            source_ids=["src_1", "src_4"],
        )
    )
    timeline.append(
        HistoricalTimelineItem(
            id="evt_2011",
            year=2011,
            date_str="2011-10-12",
            title="Phase-I Urban Growth & Regional Highway Expansion",
            category="infrastructure",
            description=f"Commissioning of major bypass roads and expansion of transport corridors connecting {district} with surrounding commercial hubs.",
            spatial_relevance="district_wide",
            source_ids=["src_2", "src_3"],
        )
    )
    timeline.append(
        HistoricalTimelineItem(
            id="evt_2016",
            year=2016,
            date_str="2016-04-18",
            title="Smart City Development & Industrial Zone Demarcation",
            category="government_projects",
            description=f"Demarcation of commercial IT/manufacturing clusters and municipal boundary extensions, catalyzing peri-urban land transformation.",
            spatial_relevance="direct_aoi",
            source_ids=["src_2", "src_3"],
        )
    )
    timeline.append(
        HistoricalTimelineItem(
            id="evt_2019",
            year=2019,
            date_str="2019-09-25",
            title=f"Major Flash Flooding & Dam Discharge Incident",
            category="natural_disasters",
            description=f"Intense cloudburst and emergency reservoir sluice discharge caused significant temporary water accumulation in urbanized drainage channels.",
            spatial_relevance="direct_aoi",
            source_ids=["src_1", "src_4"],
        )
    )
    timeline.append(
        HistoricalTimelineItem(
            id="evt_2022",
            year=2022,
            date_str="2022-11-30",
            title="Ring Road Construction & Outer Corridor Expansion",
            category="infrastructure",
            description=f"Massive earthworks and surface paving for outer connectivity ring road, converting peripheral agricultural parcels into transport infrastructure.",
            spatial_relevance="direct_aoi",
            source_ids=["src_2", "src_3"],
        )
    )
    timeline.append(
        HistoricalTimelineItem(
            id="evt_2025",
            year=2025,
            date_str="2025-08-14",
            title="Drainage Re-engineering & Flood Resilience Infrastructure",
            category="environmental",
            description=f"Implementation of engineered storm water channels, riverfront restoration, and desiltation programs across critical catchment zones.",
            spatial_relevance="district_wide",
            source_ids=["src_1", "src_4"],
        )
    )

    # Event categories grouping
    categories = [
        HistoricalEventCategory(
            category="natural_disasters",
            label="Natural Disasters & Weather Events",
            events=[t for t in timeline if t.category == "natural_disasters"],
        ),
        HistoricalEventCategory(
            category="infrastructure",
            label="Infrastructure & Transport Projects",
            events=[t for t in timeline if t.category == "infrastructure"],
        ),
        HistoricalEventCategory(
            category="government_projects",
            label="Government Projects & Master Plans",
            events=[t for t in timeline if t.category == "government_projects"],
        ),
        HistoricalEventCategory(
            category="environmental",
            label="Environmental & Water Resource Management",
            events=[t for t in timeline if t.category == "environmental"],
        ),
    ]

    # Historical development narrative
    dev_summary = HistoricalDevelopment(
        urban_expansion=(
            f"Over the 2000–2026 observation window, {district} underwent significant outward urban sprawl, "
            f"particularly along primary transport radials. Agricultural peripheral lands transitioned into "
            f"dense residential layouts and commercial parks."
        ),
        infrastructure_evolution=(
            f"Infrastructure development accelerated with multi-lane bypass arterials, flyovers, and logistics "
            f"nodes commissioned post-2011, establishing continuous built-up corridors across the region."
        ),
        environmental_record=(
            f"Historical disaster annals document recurring seasonal water logging and notable flood events in 2005 "
            f"and 2019, primarily driven by intense localized precipitation and river channel constriction."
        ),
        agricultural_transition=(
            f"Traditional seasonal crop cultivation in surrounding blocks progressively shifted toward high-value peri-urban "
            f"horticulture and industrial conversions as zoning regulations expanded."
        ),
    )

    # Context analysis with non-causal grounding distinction
    context_analysis = RelevantHistoricalContext(
        summary=(
            f"Documented records show {district}, {state} experienced both episodic hydrological extremes (2005, 2019) "
            f"and sustained infrastructure investments over the analyzed period. These external historical milestones "
            f"correlate chronologically with major regional land-use shifts."
        ),
        interpretation_notes=(
            f"When interpreting satellite-derived indices (e.g. NDVI drops or SAR backscatter variations) for this AOI, "
            f"analysts should evaluate whether observed radiometric anomalies align with recorded flood discharge dates (e.g. Sept 2019) "
            f"or permanent infrastructure ground clearances (e.g. 2022 ring road projects)."
        ),
        methodological_caveat=(
            "Historical context provides documented background records that help contextualize observed surface patterns, "
            "but does not independently prove causal attribution without rigorous domain-level validation."
        ),
    )

    overview = LocationOverview(
        location_name=f"{district}, {state}",
        district=district,
        state=state,
        country="India",
        unit_id=f"IN-{state[:2].upper()}-{district.upper()}",
        centroid=centroid,
        bounds_wgs84=bounds,
        period_analysed=period,
        topics=topics if topics else ["Infrastructure", "Disaster History", "Urban Expansion"],
    )

    queries_used = generate_search_queries(district, state, period, ", ".join(topics))

    return HistoricalContextReport(
        id=report_id,
        created_at=now_iso,
        overview=overview,
        timeline=timeline,
        major_events=categories,
        development_summary=dev_summary,
        context_analysis=context_analysis,
        sources=sources,
        search_queries_used=queries_used,
        cached=False,
    )


async def research_location_history(
    location: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    bbox: Optional[List[float]] = None,
    date_range: str = "2000-2026",
    topic: str = "infrastructure, flooding, urban development",
    scene_id: Optional[str] = None,
) -> HistoricalContextReport:
    """
    Main research orchestrator for Location History & Context.
    """
    district, state, unit_id, centroid, bounds = resolve_location(
        location_str=location,
        lat=lat,
        lon=lon,
        bbox=bbox,
        scene_id=scene_id,
    )

    topics_list = [t.strip().title() for t in topic.split(",") if t.strip()]
    cache_key = _get_cache_key(district, state, date_range, topic)

    if cache_key in _HISTORY_CACHE:
        cached_rep = _HISTORY_CACHE[cache_key]
        cached_copy = cached_rep.model_copy()
        cached_copy.cached = True
        return cached_copy

    report = await _researched_report(
        district=district,
        state=state,
        period=date_range,
        topics=topics_list,
        centroid=centroid,
        bounds=bounds,
    )

    # A fallback report must not be cached: the next attempt should get a
    # real one rather than being served the template until restart.
    if report.provenance != "synthesized":
        _HISTORY_CACHE[cache_key] = report
    return report


async def _researched_report(
    district: str,
    state: str,
    period: str,
    topics: List[str],
    centroid: Optional[Tuple[float, float]],
    bounds: Optional[List[float]],
) -> HistoricalContextReport:
    """
    Build the report from documents actually retrieved from the web.

    Pipeline: generate targeted queries -> fetch (Wikipedia + DuckDuckGo) ->
    have a model extract dated events from what came back -> validate every
    event against the retrieved set -> assemble.

    Falls back to `_template_report` only when retrieval returns nothing or the
    model is unavailable, and the returned report says which happened. The
    caller can always distinguish the two by `provenance`.
    """
    from features.location_history import extraction, retrieval

    queries = generate_search_queries(district, state, period, ", ".join(topics))
    lo, hi = _parse_period(period)

    try:
        docs = await retrieval.search_many(queries, per_query=4)
    except Exception as e:  # noqa: BLE001
        log.warning("location-context retrieval failed entirely: %r", e)
        docs = []

    if not docs:
        return _fallback(
            district, state, period, topics, centroid, bounds,
            "No sources could be retrieved for this district - the research APIs "
            "were unreachable or returned nothing.")

    result, why = await extraction.extract_timeline(
        district=district, state=state, period=period, topics=topics,
        docs=docs, lo=lo, hi=hi,
    )
    if result is None:
        return _fallback(
            district, state, period, topics, centroid, bounds,
            f"{len(docs)} sources were retrieved, but {why}.")

    timeline: List[HistoricalTimelineItem] = result["timeline"]
    sources = extraction.docs_to_sources(docs)

    # Keep only the sources something actually cites, so the source list is not
    # padded with documents that contributed nothing to the report.
    cited_ids = {sid for evt in timeline for sid in evt.source_ids}
    sources = [s for s in sources if s.id in cited_ids] or sources

    note = (f"Timeline extracted from {len(docs)} retrieved document(s) by "
            f"{result['model']}; every event cites a source you can open.")
    if result["rejected"]:
        note += (f" {len(result['rejected'])} candidate event(s) were dropped for "
                 "citing nothing retrievable or falling outside the window.")

    return HistoricalContextReport(
        id=f"hist_rep_{uuid.uuid4().hex[:8]}",
        created_at=datetime.now(timezone.utc).isoformat(),
        overview=_overview(district, state, centroid, bounds, period, topics),
        timeline=timeline,
        major_events=_categorise(timeline),
        development_summary=result["development_summary"],
        context_analysis=result["context_analysis"],
        sources=sources,
        search_queries_used=queries,
        cached=False,
        provenance="retrieved",
        provenance_note=note,
    )


def _fallback(
    district: str, state: str, period: str, topics: List[str],
    centroid: Optional[Tuple[float, float]], bounds: Optional[List[float]],
    reason: str,
) -> HistoricalContextReport:
    """The generic template, stamped so an API consumer can still tell it apart."""
    report = _template_report(
        district=district, state=state, period=period,
        topics=topics, centroid=centroid, bounds=bounds,
    )
    report.provenance = "synthesized"
    report.provenance_note = reason
    return report


def _overview(district, state, centroid, bounds, period, topics) -> LocationOverview:
    return LocationOverview(
        location_name=f"{district}, {state}",
        district=district,
        state=state,
        country="India",
        unit_id=f"IN-{state[:2].upper()}-{district.upper()}",
        centroid=centroid,
        bounds_wgs84=bounds,
        period_analysed=period,
        topics=topics or ["Infrastructure", "Disaster History", "Urban Expansion"],
    )


_CATEGORY_LABELS = [
    ("natural_disasters", "Natural Disasters & Weather Events"),
    ("infrastructure", "Infrastructure & Transport Projects"),
    ("government_projects", "Government Projects & Master Plans"),
    ("environmental", "Environmental & Water Resource Management"),
    ("urban_development", "Urban Development & Settlement Growth"),
    ("agriculture", "Agriculture & Land Use"),
    ("industry_mining", "Industry & Extraction"),
    ("general", "Other Recorded Events"),
]


def _categorise(timeline: List[HistoricalTimelineItem]) -> List[HistoricalEventCategory]:
    """Group events by category, omitting categories nothing fell into."""
    groups = []
    for key, label in _CATEGORY_LABELS:
        events = [t for t in timeline if t.category == key]
        if events:
            groups.append(HistoricalEventCategory(category=key, label=label, events=events))
    return groups
