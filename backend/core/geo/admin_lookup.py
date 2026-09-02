"""
Offline admin-boundary lookup — Extensions PRD §3.5.

Point-in-polygon and name search over a bundled India admin-2 boundary file.
Loaded once into a Shapely STRtree at startup; ~780 districts, negligible memory.

No geocoding API, no rate limit, no network dependency.
"""

from __future__ import annotations

import json
import logging
import os
import re
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel

log = logging.getLogger(__name__)

# Lazy imports so the module loads even if shapely is not installed
_shapely_loaded = False
_strtree = None
_geometries = []
_units = []


class AdminUnit(BaseModel):
    """One Indian district."""
    unit_id: str            # "IN-MH-PUNE"
    district: str           # "Pune"
    state: str              # "Maharashtra"
    centroid: Tuple[float, float]   # (lon, lat)
    bounds_wgs84: List[float]       # [west, south, east, north]


class AdminLookup:
    """
    Point-in-polygon and name search over a bundled India admin-2 boundary file.
    Loaded once into an STRtree at startup; ~780 districts, negligible memory.
    """

    def __init__(self, path: str = None):
        if path is None:
            path = os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
                "data", "admin", "india_districts.geojson"
            )
        self._path = path
        self._loaded = False
        self._units: List[AdminUnit] = []
        self._geometries = []
        self._strtree = None
        self._version = "unknown"

        # Read version file if present
        version_path = os.path.join(os.path.dirname(path), "VERSION")
        if os.path.exists(version_path):
            with open(version_path, "r") as f:
                self._version = f.read().strip()

    def _ensure_loaded(self):
        if self._loaded:
            return
        self._loaded = True

        if not os.path.exists(self._path):
            log.warning("Admin boundary file not found at %s", self._path)
            return

        try:
            from shapely.geometry import shape
            from shapely import STRtree
        except ImportError:
            log.warning("shapely not installed — AdminLookup will not work")
            return

        try:
            with open(self._path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            log.warning("Failed to load admin boundaries: %s", e)
            return

        features = data.get("features", [])
        log.info("Loading %d district boundaries from %s", len(features), self._path)

        for feat in features:
            props = feat.get("properties", {})
            geom = feat.get("geometry")
            if not geom:
                continue

            # Try multiple possible property names
            district = (props.get("dtname") or props.get("DISTRICT") or
                       props.get("NAME_2") or props.get("district") or
                       props.get("name") or "Unknown")
            state = (props.get("stname") or props.get("STATE") or
                    props.get("NAME_1") or props.get("state") or "Unknown")

            # Clean up
            district = district.strip().title()
            state = state.strip().title()

            # Build unit_id
            state_code = _state_code(state)
            dist_slug = re.sub(r'[^a-z]+', '_', district.lower()).strip('_')
            unit_id = f"IN-{state_code}-{dist_slug.upper()}"

            try:
                shp = shape(geom)
                if not shp.is_valid:
                    shp = shp.buffer(0)

                centroid = shp.centroid
                bounds = shp.bounds  # (minx, miny, maxx, maxy)

                unit = AdminUnit(
                    unit_id=unit_id,
                    district=district,
                    state=state,
                    centroid=(round(centroid.x, 6), round(centroid.y, 6)),
                    bounds_wgs84=[round(bounds[0], 6), round(bounds[1], 6),
                                  round(bounds[2], 6), round(bounds[3], 6)],
                )
                self._units.append(unit)
                self._geometries.append(shp)
            except Exception as e:
                log.debug("Skipping feature: %s", e)

        if self._geometries:
            self._strtree = STRtree(self._geometries)
            log.info("AdminLookup ready: %d districts indexed", len(self._units))

    @property
    def version(self) -> str:
        return self._version

    @property
    def count(self) -> int:
        self._ensure_loaded()
        return len(self._units)

    def label_for(self, lon: float, lat: float) -> Optional[AdminUnit]:
        """Point-in-polygon: which district contains this coordinate?"""
        self._ensure_loaded()
        if not self._strtree:
            return None

        from shapely.geometry import Point
        pt = Point(lon, lat)

        # STRtree.query returns indices of geometries whose envelopes intersect
        idxs = self._strtree.query(pt)
        for idx in idxs:
            if self._geometries[idx].contains(pt):
                return self._units[idx]

        # Fallback: nearest
        if self._geometries:
            nearest_idx = self._strtree.nearest(pt)
            return self._units[nearest_idx]

        return None

    def labels_for_bbox(self, bounds: List[float]) -> List[AdminUnit]:
        """All districts that intersect a bounding box. AOIs straddle districts."""
        self._ensure_loaded()
        if not self._strtree or len(bounds) < 4:
            return []

        from shapely.geometry import box
        bbox = box(bounds[0], bounds[1], bounds[2], bounds[3])

        idxs = self._strtree.query(bbox)
        results = []
        for idx in idxs:
            if self._geometries[idx].intersects(bbox):
                results.append(self._units[idx])

        return results

    def search(self, q: str, limit: int = 10) -> List[AdminUnit]:
        """Fuzzy search by district or state name, state-disambiguated."""
        self._ensure_loaded()
        if not q or not self._units:
            return []

        q_lower = q.lower().strip()
        scored = []

        for unit in self._units:
            # Exact prefix match on district
            d_lower = unit.district.lower()
            s_lower = unit.state.lower()

            if d_lower.startswith(q_lower):
                scored.append((1.0, unit))
            elif q_lower in d_lower:
                scored.append((0.8, unit))
            elif q_lower in s_lower:
                scored.append((0.4, unit))
            else:
                ratio = SequenceMatcher(None, q_lower, d_lower).ratio()
                if ratio > 0.5:
                    scored.append((ratio * 0.7, unit))

        scored.sort(key=lambda x: -x[0])
        return [u for _, u in scored[:limit]]

    def geometry(self, unit_id: str) -> Optional[Dict[str, Any]]:
        """Return GeoJSON geometry for a unit_id."""
        self._ensure_loaded()
        for i, unit in enumerate(self._units):
            if unit.unit_id == unit_id:
                from shapely.geometry import mapping
                return mapping(self._geometries[i])
        return None

    def all_units(self) -> List[AdminUnit]:
        """Return all loaded admin units."""
        self._ensure_loaded()
        return list(self._units)


# ---------------------------------------------------------------------------
# State code lookup
# ---------------------------------------------------------------------------
_STATE_CODES = {
    "andhra pradesh": "AP", "arunachal pradesh": "AR", "assam": "AS",
    "bihar": "BR", "chhattisgarh": "CG", "goa": "GA", "gujarat": "GJ",
    "haryana": "HR", "himachal pradesh": "HP", "jharkhand": "JH",
    "karnataka": "KA", "kerala": "KL", "madhya pradesh": "MP",
    "maharashtra": "MH", "manipur": "MN", "meghalaya": "ML",
    "mizoram": "MZ", "nagaland": "NL", "odisha": "OD", "punjab": "PB",
    "rajasthan": "RJ", "sikkim": "SK", "tamil nadu": "TN",
    "telangana": "TG", "tripura": "TR", "uttar pradesh": "UP",
    "uttarakhand": "UK", "west bengal": "WB",
    "andaman and nicobar islands": "AN", "chandigarh": "CH",
    "dadra and nagar haveli and daman and diu": "DD",
    "delhi": "DL", "jammu and kashmir": "JK", "ladakh": "LA",
    "lakshadweep": "LD", "puducherry": "PY",
    "nct of delhi": "DL", "nct": "DL",
}


def _state_code(state: str) -> str:
    return _STATE_CODES.get(state.lower().strip(), state[:2].upper())


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------
_instance: Optional[AdminLookup] = None


def get_admin_lookup() -> AdminLookup:
    global _instance
    if _instance is None:
        _instance = AdminLookup()
    return _instance
