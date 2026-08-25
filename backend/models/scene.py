from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class BandStat(BaseModel):
    index: int
    dtype: str
    min: float
    max: float
    mean: float
    std: float
    description: Optional[str] = None


class RasterMetadata(BaseModel):
    driver: str
    width: int
    height: int
    band_count: int
    dtypes: List[str]
    crs: Optional[str] = None
    transform: Optional[List[float]] = None
    bounds_native: Optional[List[float]] = None
    bounds_wgs84: Optional[List[float]] = None
    gsd_x: Optional[float] = None
    gsd_y: Optional[float] = None
    gsd_native: Optional[float] = None
    gsd_m: Optional[float] = None
    nodata: Optional[float] = None
    georeferenced: bool = False
    tags: Dict[str, Any] = Field(default_factory=dict)
    band_stats: List[BandStat] = Field(default_factory=list)


class ModalityResult(BaseModel):
    modality: str  # SAR | OPTICAL | MULTISPECTRAL | AMBIGUOUS
    confidence: float
    evidence: List[str] = Field(default_factory=list)
    is_ambiguous: bool = False


class CheckItem(BaseModel):
    name: str
    status: str  # PASS | WARN | FAIL | N/A
    detail: str


class CompatibilityReport(BaseModel):
    verdict: str  # PASS | WARN | FAIL
    checks: List[CheckItem]
    target_crs: Optional[str] = None
    target_gsd_m: Optional[float] = None


class PreviewMeta(BaseModel):
    width: int
    height: int
    bounds_wgs84: Optional[List[float]] = None
    gsd_m: Optional[float] = None
    scale_factor: float


class SceneImage(BaseModel):
    role: str  # single | optical | sar | t1 | t2
    original_filename: str
    object_path: str
    metadata: RasterMetadata
    modality: ModalityResult
    preview_path: Optional[str] = None
    thumb_path: Optional[str] = None
    preview_url: Optional[str] = None
    thumb_url: Optional[str] = None


class SceneConfirmImage(BaseModel):
    role: str
    original_filename: str
    object_path: str


class SceneConfirmRequest(BaseModel):
    workspace_id: str
    input_config: str  # SINGLE | CROSS_MODAL | BI_TEMPORAL
    images: List[SceneConfirmImage]
    name: Optional[str] = None
    benchmark_mode: bool = False
    benchmark_dataset: Optional[str] = None


class SceneROI(BaseModel):
    type: str = "Feature"
    geometry: Dict[str, Any]
    properties: Optional[Dict[str, Any]] = None


class Scene(BaseModel):
    id: str
    workspace_id: str
    name: str
    input_config: str
    benchmark_mode: bool = False
    source: Optional[str] = None
    images: List[SceneImage]
    compatibility: CompatibilityReport
    modalities: List[str]
    coreg_shift_px: Optional[float] = None
    warnings: List[str] = Field(default_factory=list)
    created_at: str
    roi: Optional[Dict[str, Any]] = None
