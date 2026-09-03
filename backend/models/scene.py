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
    overlap_fraction: Optional[float] = None
    coreg_shift_px: Optional[float] = None


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
    # Written by the enhancement feature when a run is accepted; the canvas
    # shows this in place of `preview_url` while enhancement is toggled on.
    enhanced_path: Optional[str] = None
    enhanced_url: Optional[str] = None
    # Acquisition date (ISO YYYY-MM-DD).  Read from raster tags at ingest,
    # or set explicitly by the user.  Required by the GEE-backed tools (§7.3,
    # §7.4), which query the catalog by AOI + date range.
    acquired_at: Optional[str] = None


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

    # Explicit acquisition-window overrides for the GEE-backed tools (§7.3).
    # When unset, they are derived from the per-image `acquired_at` values.
    acquired_start: Optional[str] = None
    acquired_end: Optional[str] = None

    # ------------------------------------------------------------------
    # Geospatial + temporal accessors used by the GEE tools (§7.3-§7.5).
    # These pass **metadata only** to Earth Engine - never the pixel array.
    # ------------------------------------------------------------------
    def bounds_wgs84(self) -> Optional[List[float]]:
        """
        AOI as [west, south, east, north] in EPSG:4326.

        Uses the ROI when one is set, otherwise the intersection of every
        georeferenced image footprint (the area actually covered by all
        inputs).  Returns None for a non-georeferenced / benchmark scene -
        callers must refuse rather than invent an AOI.
        """
        if self.roi:
            roi_bounds = _geojson_bounds(self.roi)
            if roi_bounds:
                return roi_bounds

        boxes = [img.metadata.bounds_wgs84 for img in self.images
                 if img.metadata.georeferenced and img.metadata.bounds_wgs84
                 and len(img.metadata.bounds_wgs84) == 4]
        if not boxes:
            return None

        west = max(b[0] for b in boxes)
        south = max(b[1] for b in boxes)
        east = min(b[2] for b in boxes)
        north = min(b[3] for b in boxes)
        if east <= west or north <= south:
            # Footprints do not intersect - fall back to the first image so the
            # caller gets a real AOI, and let the compatibility report (§6.4)
            # carry the overlap failure.
            return list(boxes[0])
        return [west, south, east, north]

    def image_date(self, *roles: str) -> Optional[str]:
        """Acquisition date (ISO YYYY-MM-DD) for the first image matching a role."""
        for img in self.images:
            if img.role in roles:
                return img.acquired_at or _date_from_tags(img.metadata.tags)
        return None

    @property
    def t1_date(self) -> Optional[str]:
        """Earlier acquisition date of a bi-temporal pair."""
        return (self.image_date("t1")
                or (self.images[0].acquired_at or _date_from_tags(self.images[0].metadata.tags)
                    if self.images else None))

    @property
    def t2_date(self) -> Optional[str]:
        """Later acquisition date of a bi-temporal pair."""
        return (self.image_date("t2")
                or (self.images[1].acquired_at or _date_from_tags(self.images[1].metadata.tags)
                    if len(self.images) > 1 else None))

    def acquisition_window(self) -> tuple:
        """
        (start, end) ISO dates covering every image in the scene.
        Explicit acquired_start/acquired_end win; otherwise derived per image.
        Returns (None, None) when no date is known anywhere.
        """
        if self.acquired_start and self.acquired_end:
            return self.acquired_start, self.acquired_end

        dates = sorted(d for d in (
            img.acquired_at or _date_from_tags(img.metadata.tags)
            for img in self.images) if d)
        if not dates:
            return self.acquired_start, self.acquired_end
        return (self.acquired_start or dates[0], self.acquired_end or dates[-1])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
_DATE_TAG_KEYS = (
    "ACQUISITION_DATE", "acquisition_date", "DATE_ACQUIRED", "date_acquired",
    "SENSING_TIME", "sensing_time", "TIFFTAG_DATETIME", "DATETIME", "datetime",
    "PRODUCT_SCENE_START_TIME", "IMAGING_DATE",
)


def _date_from_tags(tags: Dict[str, Any]) -> Optional[str]:
    """
    Pull an ISO YYYY-MM-DD acquisition date out of GeoTIFF tags.

    Handles the two shapes that actually turn up: `YYYY:MM:DD HH:MM:SS`
    (TIFFTAG_DATETIME) and `YYYY-MM-DD...` (most product metadata).
    Returns None when nothing parseable is present - never a guessed date.
    """
    if not tags:
        return None
    for key in _DATE_TAG_KEYS:
        raw = tags.get(key)
        if not raw:
            continue
        text = str(raw).strip()
        head = text.replace("T", " ").split(" ")[0]
        if len(head) >= 10:
            head = head[:10].replace(":", "-")
            parts = head.split("-")
            if len(parts) == 3 and all(p.isdigit() for p in parts):
                y, m, d = parts
                if len(y) == 4 and 1 <= int(m) <= 12 and 1 <= int(d) <= 31:
                    return f"{y}-{m}-{d}"
    return None


def _geojson_bounds(feature: Dict[str, Any]) -> Optional[List[float]]:
    """[west, south, east, north] from a GeoJSON Feature/geometry."""
    geom = feature.get("geometry", feature) if isinstance(feature, dict) else None
    if not isinstance(geom, dict):
        return None
    coords = geom.get("coordinates")
    if coords is None:
        return None

    xs: List[float] = []
    ys: List[float] = []

    def _walk(node):
        if isinstance(node, (list, tuple)):
            if (len(node) >= 2 and all(isinstance(v, (int, float)) for v in node[:2])):
                xs.append(float(node[0]))
                ys.append(float(node[1]))
            else:
                for child in node:
                    _walk(child)

    _walk(coords)
    if not xs or not ys:
        return None
    return [min(xs), min(ys), max(xs), max(ys)]
