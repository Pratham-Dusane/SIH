"""
Location History & Context Research models — Feature F12.
"""
from typing import Any, Dict, List, Literal, Optional, Tuple
from pydantic import BaseModel, Field


class LocationOverview(BaseModel):
    location_name: str
    district: str
    state: str
    country: str = "India"
    unit_id: Optional[str] = None
    centroid: Optional[Tuple[float, float]] = None  # (lon, lat)
    bounds_wgs84: Optional[List[float]] = None     # [w, s, e, n]
    period_analysed: str = "2000–2026"
    topics: List[str] = Field(default_factory=list)


class SourceItem(BaseModel):
    id: str
    title: str
    publisher: str
    date: Optional[str] = None
    url: Optional[str] = None
    excerpt: str
    source_type: Literal["official", "academic", "institutional", "news", "gazetteer"] = "official"


class HistoricalTimelineItem(BaseModel):
    id: str
    year: int
    date_str: str
    title: str
    category: Literal[
        "natural_disasters",
        "urban_development",
        "infrastructure",
        "agriculture",
        "environmental",
        "government_projects",
        "industry_mining",
        "general"
    ] = "general"
    description: str
    spatial_relevance: Literal["direct_aoi", "district_wide", "regional"] = "direct_aoi"
    source_ids: List[str] = Field(default_factory=list)


class HistoricalEventCategory(BaseModel):
    category: str
    label: str
    events: List[HistoricalTimelineItem] = Field(default_factory=list)


class HistoricalDevelopment(BaseModel):
    urban_expansion: str
    infrastructure_evolution: str
    environmental_record: str
    agricultural_transition: str


class RelevantHistoricalContext(BaseModel):
    summary: str
    interpretation_notes: str
    methodological_caveat: str = (
        "Historical context provides documented background records that may help contextualize "
        "observed surface changes, but does not independently establish causal attribution."
    )


class HistoricalContextReport(BaseModel):
    id: str
    created_at: str
    overview: LocationOverview
    timeline: List[HistoricalTimelineItem] = Field(default_factory=list)
    major_events: List[HistoricalEventCategory] = Field(default_factory=list)
    development_summary: HistoricalDevelopment
    context_analysis: RelevantHistoricalContext
    sources: List[SourceItem] = Field(default_factory=list)
    search_queries_used: List[str] = Field(default_factory=list)
    cached: bool = False
    # Provenance of the timeline itself.
    #
    # "retrieved"   - events were extracted from documents actually fetched from
    #                 the web; every event cites a source URL you can open.
    # "synthesized" - retrieval or extraction failed and this is the generic
    #                 development template: the events, publishers, dates and
    #                 URLs are all invented, and none of it is researched.
    #                 `provenance_note` says which failure caused it.
    #
    # The UI no longer surfaces this distinction (by request), so this field is
    # the only remaining way an API consumer can tell the two apart. Do not
    # drop it, and do not default it to "retrieved" at any call site.
    provenance: str = "retrieved"
    provenance_note: str = ""


class LocationHistoryRequest(BaseModel):
    location: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    bbox: Optional[List[float]] = None
    date_range: Optional[str] = "2000-2026"
    topic: Optional[str] = "infrastructure, flooding, urban development"
    question: Optional[str] = None
    scene_id: Optional[str] = None
