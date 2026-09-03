"""
Historical scenes analytics models — Extensions PRD §8 & §15.2.
"""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class KPIData(BaseModel):
    total_scenes: int = 0
    total_queries: int = 0
    mean_confidence: float = 0.0
    abstention_rate: float = 0.0
    active_districts_count: int = 0


class TimeSeriesPoint(BaseModel):
    date: str  # YYYY-MM or YYYY-QQ or ISO
    optical: int = 0
    sar: int = 0
    cross_modal: int = 0
    bi_temporal: int = 0
    total: int = 0


class TaskMixPoint(BaseModel):
    task: str
    count: int = 0
    percentage: float = 0.0


class ToolUsagePoint(BaseModel):
    tool: str
    count: int = 0
    avg_confidence: float = 0.0


class ConfidenceTrendPoint(BaseModel):
    date: str
    confidence: float = 0.0
    abstention_pct: float = 0.0


class ModalityMixPoint(BaseModel):
    name: str
    value: int = 0
    fill: Optional[str] = None


class ChangeTotalPoint(BaseModel):
    category: str
    area_ha: float = 0.0


class SceneSummary(BaseModel):
    id: str
    name: str
    workspace_id: str = "ws_demo"
    input_config: str
    modalities: List[str] = Field(default_factory=list)
    created_at: str
    district: Optional[str] = "Pune"
    state: Optional[str] = "Maharashtra"
    unit_id: Optional[str] = None
    query_count: int = 0
    mean_confidence: float = 0.0
    bounds_wgs84: Optional[List[float]] = None
    thumbnail_url: Optional[str] = None


class AnalyticsOverview(BaseModel):
    kpis: KPIData
    scenes_over_time: List[TimeSeriesPoint] = Field(default_factory=list)
    task_mix: List[TaskMixPoint] = Field(default_factory=list)
    tool_usage: List[ToolUsagePoint] = Field(default_factory=list)
    confidence_trend: List[ConfidenceTrendPoint] = Field(default_factory=list)
    modality_mix: List[ModalityMixPoint] = Field(default_factory=list)
    change_totals: List[ChangeTotalPoint] = Field(default_factory=list)
    scenes: List[SceneSummary] = Field(default_factory=list)
    districts: List[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Cross-scene assistant — Extensions PRD §8 (F5)
# ---------------------------------------------------------------------------
class AssistantAggregates(BaseModel):
    """Workspace totals, computed from stored rows — never model-generated."""
    scene_count: int
    query_count: int
    georeferenced_scenes: int
    by_input_config: Dict[str, int] = Field(default_factory=dict)
    mean_confidence: Optional[float] = None


class AssistantRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    vlm_backend: Optional[str] = None
    k: int = Field(default=6, ge=1, le=20)


class AssistantResponse(BaseModel):
    answer: str
    citations: List[str] = Field(default_factory=list)
    aggregates: AssistantAggregates
    grounded: bool = True
    # Set when the language model was unreachable and the answer is the
    # deterministic record dump instead.  The UI says so rather than passing
    # a fallback off as a generated answer.
    degraded: bool = False
    reason: Optional[str] = None
    model: Optional[str] = None
