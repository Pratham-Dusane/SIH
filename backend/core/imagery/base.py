"""
Imagery acquisition adapter — Extensions PRD §3.4.

One protocol, multiple consumers (F3 temporal fetch, F10 monitor, F11 live pull).
GEESource wraps the existing core/gee.py initialisation — it does not open a
second session.

Search before fetch, always.  Every consumer calls search() first.
"""

from __future__ import annotations

import io
import logging
import os
import zipfile
from datetime import datetime, timedelta
from typing import Any, Dict, List, Literal, Optional, Protocol, Sequence

from pydantic import BaseModel, Field

from core.config import settings

log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class BBox(BaseModel):
    """Bounding box in EPSG:4326 — [west, south, east, north]."""
    west: float
    south: float
    east: float
    north: float

    def __init__(self, west: float = 0, south: float = 0, east: float = 0, north: float = 0, **kw):
        super().__init__(west=west, south=south, east=east, north=north, **kw)

    def to_list(self) -> list[float]:
        return [self.west, self.south, self.east, self.north]

    @classmethod
    def from_list(cls, bounds: Sequence[float]) -> "BBox":
        return cls(west=bounds[0], south=bounds[1], east=bounds[2], north=bounds[3])


class Candidate(BaseModel):
    """A single acquisition returned by search()."""
    asset_id: str
    collection: str
    acquired_at: str
    cloud_fraction: Optional[float] = None
    gsd_m: float
    orbit: Optional[str] = None
    footprint_wgs84: List[float] = Field(default_factory=list)


class ImageryTile(BaseModel):
    """A fetched tile, written as a local GeoTIFF."""
    source: str                          # "gee" | "bhoonidhi"
    collection: str                      # "COPERNICUS/S2_SR_HARMONIZED"
    asset_ids: List[str] = Field(default_factory=list)
    acquired_start: str
    acquired_end: str
    composite: bool = False
    cloud_fraction: Optional[float] = None
    crs: str = "EPSG:4326"
    gsd_m: float = 10.0
    bounds_wgs84: List[float] = Field(default_factory=list)
    local_path: str = ""
    provenance: Dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Protocol
# ---------------------------------------------------------------------------
class ImagerySource(Protocol):
    name: str

    def search(self, aoi: BBox, start: str, end: str,
               max_cloud: Optional[float] = None) -> list[Candidate]:
        ...

    async def fetch(self, aoi: BBox, selection: Optional[list[str]],
                    start: str, end: str, *,
                    target_crs: Optional[str] = None,
                    target_gsd_m: Optional[float] = None,
                    composite: bool = False) -> ImageryTile:
        ...


# ---------------------------------------------------------------------------
# GEE Implementation — full, not a stub
# ---------------------------------------------------------------------------
class GEESource:
    """
    Full GEE imagery source.  Reuses core/gee.py's initialisation —
    does not open a second session.
    """
    name = "gee"

    # Collection metadata for search/fetch
    COLLECTIONS = {
        "optical": {
            "id": "COPERNICUS/S2_SR_HARMONIZED",
            "label": "Sentinel-2 L2A",
            "gsd_m": 10.0,
            "cloud_field": "CLOUDY_PIXEL_PERCENTAGE",
        },
        "sar": {
            "id": "COPERNICUS/S1_GRD",
            "label": "Sentinel-1 GRD",
            "gsd_m": 10.0,
            "cloud_field": None,
        },
    }

    def _require_ee(self):
        from core.gee import require_gee
        return require_gee()

    def search(self, aoi: BBox, start: str, end: str,
               max_cloud: Optional[float] = None,
               modality: str = "optical") -> list[Candidate]:
        """
        Search for acquisitions covering the AOI in the date range.
        Returns candidates sorted by cloud fraction (optical) or date (SAR).
        """
        ee = self._require_ee()
        rect = ee.Geometry.Rectangle(aoi.to_list(), proj="EPSG:4326", geodesic=False)

        coll_info = self.COLLECTIONS.get(modality, self.COLLECTIONS["optical"])
        coll_id = coll_info["id"]

        col = (ee.ImageCollection(coll_id)
               .filterBounds(rect)
               .filterDate(start, end))

        if modality == "sar":
            col = (col.filter(ee.Filter.eq("instrumentMode", "IW"))
                   .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV")))

        if max_cloud is not None and coll_info["cloud_field"]:
            col = col.filter(ee.Filter.lt(coll_info["cloud_field"], max_cloud))

        # Limit to 50 candidates to avoid huge getInfo calls
        col = col.limit(50, coll_info["cloud_field"] or "system:time_start")

        try:
            info_list = col.getInfo()
        except Exception as e:
            log.warning("GEE search failed: %s", e)
            return []

        candidates = []
        features = info_list.get("features", []) if info_list else []
        for feat in features:
            props = feat.get("properties", {})
            img_id = feat.get("id", "")
            ts = props.get("system:time_start", 0)
            acq_date = datetime.utcfromtimestamp(ts / 1000).strftime("%Y-%m-%d") if ts else ""

            cloud = None
            if coll_info["cloud_field"]:
                cloud = props.get(coll_info["cloud_field"])
                if cloud is not None:
                    cloud = round(float(cloud) / 100.0, 3)  # fraction

            orbit = props.get("orbitProperties_pass") or props.get("SENSING_ORBIT_NUMBER")

            candidates.append(Candidate(
                asset_id=img_id,
                collection=coll_id,
                acquired_at=acq_date,
                cloud_fraction=cloud,
                gsd_m=coll_info["gsd_m"],
                orbit=str(orbit) if orbit else None,
                footprint_wgs84=aoi.to_list(),
            ))

        return candidates

    async def fetch(self, aoi: BBox, selection: Optional[list[str]],
                    start: str, end: str, *,
                    target_crs: Optional[str] = None,
                    target_gsd_m: Optional[float] = None,
                    composite: bool = False,
                    modality: str = "optical") -> ImageryTile:
        """
        Fetch imagery for the AOI.  Uses getDownloadURL for small areas,
        reusing core/gee.py's proven download path.
        """
        import httpx

        ee = self._require_ee()
        rect = ee.Geometry.Rectangle(aoi.to_list(), proj="EPSG:4326", geodesic=False)

        coll_info = self.COLLECTIONS.get(modality, self.COLLECTIONS["optical"])
        coll_id = coll_info["id"]
        scale = int(target_gsd_m or coll_info["gsd_m"])
        crs = target_crs or "EPSG:4326"

        col = (ee.ImageCollection(coll_id)
               .filterBounds(rect)
               .filterDate(start, end))

        if modality == "sar":
            col = (col.filter(ee.Filter.eq("instrumentMode", "IW"))
                   .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
                   .select("VV"))
        else:
            col = col.filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40))

        if selection:
            col = col.filter(ee.Filter.inList("system:index", selection))

        count = int(col.size().getInfo())
        if count == 0:
            raise RuntimeError(f"No {coll_info['label']} imagery for AOI between {start} and {end}")

        asset_ids = []
        try:
            id_list = col.aggregate_array("system:index").getInfo()
            asset_ids = id_list[:10] if id_list else []
        except Exception:
            pass

        # Build the image (composite or single)
        if composite or count > 1:
            if modality == "optical":
                # Cloud-masked median composite
                def _mask_clouds(img):
                    scl = img.select("SCL")
                    keep = (scl.neq(3).And(scl.neq(8)).And(scl.neq(9)).And(scl.neq(10)))
                    return img.updateMask(keep)
                image = col.map(_mask_clouds).median().clip(rect)
            else:
                image = col.median().clip(rect)
            is_composite = True
        else:
            image = col.first().clip(rect)
            is_composite = False

        # Select bands for download
        if modality == "optical":
            image = image.select(["B4", "B3", "B2", "B8"])
        # SAR already selected VV above

        # Download via getDownloadURL
        out_dir = os.path.join(settings.LOCAL_STORAGE_ROOT, "imagery_fetch")
        os.makedirs(out_dir, exist_ok=True)
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        out_path = os.path.join(out_dir, f"{modality}_{timestamp}.tif")

        try:
            url = image.getDownloadURL({
                "region": rect,
                "scale": scale,
                "format": "GEO_TIFF",
                "crs": crs,
            })
            async with httpx.AsyncClient(timeout=180.0, follow_redirects=True) as client:
                r = await client.get(url)
            r.raise_for_status()
            payload = r.content

            # GEO_TIFF sometimes arrives zipped
            if payload[:2] == b"PK":
                with zipfile.ZipFile(io.BytesIO(payload)) as zf:
                    names = [n for n in zf.namelist() if n.lower().endswith(".tif")]
                    if not names:
                        raise RuntimeError("Downloaded zip contains no GeoTIFF")
                    with open(out_path, "wb") as f:
                        f.write(zf.read(names[0]))
            else:
                with open(out_path, "wb") as f:
                    f.write(payload)
        except Exception as e:
            raise RuntimeError(f"GEE download failed: {e}") from e

        # Determine acquisition dates from the collection
        acq_start = start
        acq_end = end
        if not is_composite and asset_ids:
            try:
                first_props = col.first().getInfo().get("properties", {})
                ts = first_props.get("system:time_start", 0)
                if ts:
                    dt = datetime.utcfromtimestamp(ts / 1000)
                    acq_start = acq_end = dt.strftime("%Y-%m-%d")
            except Exception:
                pass

        cloud_frac = None
        if modality == "optical" and not is_composite:
            try:
                first_props = col.first().getInfo().get("properties", {})
                cp = first_props.get("CLOUDY_PIXEL_PERCENTAGE")
                if cp is not None:
                    cloud_frac = round(float(cp) / 100.0, 3)
            except Exception:
                pass

        return ImageryTile(
            source="gee",
            collection=coll_id,
            asset_ids=asset_ids,
            acquired_start=acq_start,
            acquired_end=acq_end,
            composite=is_composite,
            cloud_fraction=cloud_frac,
            crs=crs,
            gsd_m=float(scale),
            bounds_wgs84=aoi.to_list(),
            local_path=out_path,
            provenance={
                "kind": "gee_fetch",
                "collection": coll_id,
                "asset_ids": asset_ids,
                "composite": is_composite,
                "scale_m": scale,
                "crs": crs,
                "cloud_fraction": cloud_frac,
            },
        )


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------
_SOURCES: Dict[str, ImagerySource] = {}


def get_imagery_source(name: str = "gee") -> ImagerySource:
    """Get or create an imagery source by name."""
    if name not in _SOURCES:
        if name == "gee":
            _SOURCES[name] = GEESource()
        else:
            raise ValueError(f"Unknown imagery source: {name}")
    return _SOURCES[name]
