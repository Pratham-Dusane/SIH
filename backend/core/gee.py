"""
Google Earth Engine integration — PRD §7.2, §7.3, §7.4, §7.5.

Everything here takes **AOI bounds and dates** — metadata only.  The uploaded
pixel array is never sent to Earth Engine.  That is why the GEE-backed tools
break Design Rule 3 (online-only) but not Design Rule 2 (§7.0).

`init_gee()` is a startup-time dependency for any GEE-backed tool.  If it
fails, those tools mark themselves unavailable and the input gate (§9.3)
reports it as a missing capability, not a crash.
"""

from __future__ import annotations

import io
import logging
import os
import zipfile
from typing import Any, Dict, List, Optional, Sequence, Tuple

from core.config import settings

log = logging.getLogger(__name__)

# Cached initialisation state so init_gee() is idempotent and a failed init
# does not re-attempt (and re-block) on every tool call.
_STATE: Dict[str, Any] = {"attempted": False, "initialized": False, "reason": "not attempted"}


class GEEUnavailable(RuntimeError):
    """Raised when Earth Engine is not initialised and a GEE tool needs it."""


# ---------------------------------------------------------------------------
# §7.2 Setup
# ---------------------------------------------------------------------------
def init_gee(force: bool = False) -> bool:
    """
    Initialise Earth Engine with a service account.  Idempotent, never raises.

    Requires a GCP service account with Earth Engine API access, enrolled in a
    registered EE project.  Returns True when `ee` is usable.
    """
    if _STATE["attempted"] and not force:
        return bool(_STATE["initialized"])

    _STATE["attempted"] = True
    _STATE["initialized"] = False

    if settings.OFFLINE_MODE:
        _STATE["reason"] = ("OFFLINE_MODE=true — Earth Engine is not offline-capable "
                            "(PRD §11.5)")
        return False

    try:
        import ee  # noqa: F401
    except ImportError:
        _STATE["reason"] = "earthengine-api is not installed (pip install earthengine-api)"
        return False

    import ee

    sa = settings.GEE_SERVICE_ACCOUNT
    key_path = settings.GEE_KEY_PATH
    if not sa or not key_path:
        _STATE["reason"] = "GEE_SERVICE_ACCOUNT and/or GEE_KEY_PATH are not set"
        return False
    if not os.path.exists(key_path):
        _STATE["reason"] = f"GEE key file not found at {key_path}"
        return False

    try:
        creds = ee.ServiceAccountCredentials(sa, key_path)
        if settings.GEE_PROJECT:
            ee.Initialize(creds, project=settings.GEE_PROJECT)
        else:
            ee.Initialize(creds)
        # Force a real round-trip so a bad enrolment fails here, at startup,
        # rather than inside a tool call mid-query.
        ee.Number(1).getInfo()
    except Exception as e:  # noqa: BLE001 — startup must degrade, not crash
        _STATE["reason"] = f"{type(e).__name__}: {e}"
        log.warning("Earth Engine initialisation failed: %s", _STATE["reason"])
        return False

    _STATE["initialized"] = True
    _STATE["reason"] = (f"initialised as {sa}"
                        + (f" on project {settings.GEE_PROJECT}" if settings.GEE_PROJECT else ""))
    log.info("Earth Engine initialised: %s", _STATE["reason"])
    return True


def gee_available() -> Tuple[bool, str]:
    """(available, reason).  Never raises — the input gate (§9.3) reads this."""
    ok = init_gee()
    return ok, str(_STATE["reason"])


def gee_status() -> Dict[str, Any]:
    """Served at GET /api/health/models and GET /health (§14)."""
    ok, reason = gee_available()
    return {
        "gee_initialized": ok,
        "reason": reason,
        "service_account": settings.GEE_SERVICE_ACCOUNT or None,
        "project": settings.GEE_PROJECT or None,
        "key_path_present": bool(settings.GEE_KEY_PATH and os.path.exists(settings.GEE_KEY_PATH)),
        "offline_capable": False,
    }


def require_gee():
    """Return the `ee` module, or raise GEEUnavailable with the reason."""
    if not init_gee():
        raise GEEUnavailable(str(_STATE["reason"]))
    import ee
    return ee


def _rect(ee, bounds: Sequence[float]):
    """bounds = [west, south, east, north] in EPSG:4326."""
    w, s, e, n = (float(v) for v in bounds)
    return ee.Geometry.Rectangle([w, s, e, n], proj="EPSG:4326", geodesic=False)


# ---------------------------------------------------------------------------
# §7.3 Land cover — Dynamic World, falling back to ESA WorldCover
# ---------------------------------------------------------------------------
DYNAMIC_WORLD_CLASSES = [
    "water", "trees", "grass", "flooded_vegetation", "crops",
    "shrub_and_scrub", "built", "bare", "snow_and_ice",
]

# ESA WorldCover v100/v200 class values -> readable labels
WORLDCOVER_CLASSES = {
    10: "trees", 20: "shrub_and_scrub", 30: "grass", 40: "crops",
    50: "built", 60: "bare", 70: "snow_and_ice", 80: "water",
    90: "flooded_vegetation", 95: "mangroves", 100: "moss_and_lichen",
}


def normalise_histogram(hist: Dict[str, float],
                        labels: Optional[Dict[Any, str]] = None) -> Dict[str, float]:
    """
    Turn a GEE frequencyHistogram ({class_value: pixel_count}) into
    {class_label: fraction} summing to 1.0.  Zero-count classes are dropped.
    """
    total = sum(float(v) for v in hist.values())
    if total <= 0:
        return {}
    out: Dict[str, float] = {}
    for key, count in hist.items():
        count = float(count)
        if count <= 0:
            continue
        if labels is not None:
            label = labels.get(int(float(key)), f"class_{key}")
        else:
            idx = int(float(key))
            label = (DYNAMIC_WORLD_CLASSES[idx]
                     if 0 <= idx < len(DYNAMIC_WORLD_CLASSES) else f"class_{idx}")
        out[label] = out.get(label, 0.0) + count / total
    return {k: round(v, 4) for k, v in sorted(out.items(), key=lambda kv: -kv[1])}


def render_landcover_summary(fractions: Dict[str, float], product: str) -> str:
    """Human-readable land-cover sentence for the ToolResult text field."""
    if not fractions:
        return (f"{product} returned no land-cover pixels for this AOI and date range.")
    parts = [f"{label.replace('_', ' ')} {frac * 100:.1f}%"
             for label, frac in list(fractions.items())[:5]]
    return (f"{product} land cover over the scene AOI: " + ", ".join(parts) + ". "
            "These are fractions of a global reference product for the same footprint, "
            "not a classification of the uploaded raster.")


def land_cover(bounds: Sequence[float], start: str, end: str,
               scale: int = 10) -> Dict[str, Any]:
    """
    Land-cover class fractions for an AOI.  Dynamic World first; falls back to
    ESA WorldCover if Dynamic World has no coverage for the date range (§7.3).

    Returns {"product", "class_fractions", "scale_m", "pixel_total", "fallback"}.
    """
    ee = require_gee()
    aoi = _rect(ee, bounds)

    # --- Dynamic World -----------------------------------------------------
    dw_col = (ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1")
              .filterBounds(aoi).filterDate(start, end).select("label"))
    dw_count = int(dw_col.size().getInfo())

    if dw_count > 0:
        dw = dw_col.mode()
        stats = dw.reduceRegion(
            reducer=ee.Reducer.frequencyHistogram(),
            geometry=aoi, scale=scale, maxPixels=int(1e9), bestEffort=True)
        hist = (stats.getInfo() or {}).get("label") or {}
        fractions = normalise_histogram(hist)
        if fractions:
            return {
                "product": "GOOGLE/DYNAMICWORLD/V1",
                "product_label": "Dynamic World V1",
                "class_fractions": fractions,
                "scale_m": scale,
                "pixel_total": int(sum(float(v) for v in hist.values())),
                "image_count": dw_count,
                "date_range": [start, end],
                "fallback": False,
            }

    # --- ESA WorldCover fallback ------------------------------------------
    for coll_id, label in (("ESA/WorldCover/v200", "ESA WorldCover v200"),
                           ("ESA/WorldCover/v100", "ESA WorldCover v100")):
        try:
            wc = ee.ImageCollection(coll_id).first().select("Map").clip(aoi)
            stats = wc.reduceRegion(
                reducer=ee.Reducer.frequencyHistogram(),
                geometry=aoi, scale=max(scale, 10), maxPixels=int(1e9), bestEffort=True)
            hist = (stats.getInfo() or {}).get("Map") or {}
            fractions = normalise_histogram(hist, labels=WORLDCOVER_CLASSES)
            if fractions:
                return {
                    "product": coll_id,
                    "product_label": label,
                    "class_fractions": fractions,
                    "scale_m": max(scale, 10),
                    "pixel_total": int(sum(float(v) for v in hist.values())),
                    "image_count": 1,
                    "date_range": [start, end],
                    "fallback": True,
                    "fallback_reason": (
                        "Dynamic World had no coverage for this AOI and date range"),
                }
        except Exception as e:  # noqa: BLE001 — try the next collection
            log.debug("WorldCover %s failed: %s", coll_id, e)

    return {
        "product": None,
        "product_label": None,
        "class_fractions": {},
        "scale_m": scale,
        "pixel_total": 0,
        "image_count": 0,
        "date_range": [start, end],
        "fallback": True,
        "fallback_reason": ("neither Dynamic World nor ESA WorldCover returned "
                            "pixels for this AOI"),
    }


# ---------------------------------------------------------------------------
# §7.4 Change detection — NDVI/NDBI differencing over Sentinel-2 composites
# ---------------------------------------------------------------------------
def s2_composite(ee, aoi, date: str, window_days: int = 30):
    """
    Cloud-masked median Sentinel-2 SR composite centred on `date`.

    A single-date scene almost never has a usable cloud-free acquisition, so a
    +/- window_days median composite is used.  The window is reported in the
    tool's facts so the number is never mistaken for a single-date measurement.
    """
    start = ee.Date(date).advance(-window_days, "day")
    end = ee.Date(date).advance(window_days, "day")

    col = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
           .filterBounds(aoi).filterDate(start, end)
           .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40)))

    def _mask_clouds(img):
        scl = img.select("SCL")
        # SCL 3=cloud shadow, 8/9=cloud medium/high probability, 10=cirrus
        keep = (scl.neq(3).And(scl.neq(8)).And(scl.neq(9)).And(scl.neq(10)))
        return img.updateMask(keep)

    return col.map(_mask_clouds).median().clip(aoi)


def _download_geotiff(ee, image, aoi, scale: int, out_path: str) -> Optional[str]:
    """
    Pull a small single-band GeoTIFF straight out of Earth Engine.

    PRD §7.4 describes `ee.batch` export + poll + download.  A batch export can
    only target Drive or GCS, which is unusable while STORAGE_BACKEND=local, and
    adds minutes of polling to an interactive query.  `getDownloadURL` returns
    the same raster synchronously for AOI-sized requests, so that is the path
    used here; it is the only deviation from §7.4 and it fails soft — a None
    return means stats-only, never a crash.
    """
    import httpx

    try:
        url = image.getDownloadURL({
            "region": aoi,
            "scale": scale,
            "format": "GEO_TIFF",
            "crs": "EPSG:4326",
        })
        with httpx.Client(timeout=180.0, follow_redirects=True) as client:
            r = client.get(url)
        r.raise_for_status()
        payload = r.content

        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        # GEO_TIFF sometimes arrives zipped when multiple bands are requested.
        if payload[:2] == b"PK":
            with zipfile.ZipFile(io.BytesIO(payload)) as zf:
                names = [n for n in zf.namelist() if n.lower().endswith(".tif")]
                if not names:
                    return None
                with open(out_path, "wb") as f:
                    f.write(zf.read(names[0]))
        else:
            with open(out_path, "wb") as f:
                f.write(payload)
        return out_path
    except Exception as e:  # noqa: BLE001 — export is best-effort
        log.warning("GEE GeoTIFF download failed: %s", e)
        return None


def change_ndvi_ndbi(bounds: Sequence[float], t1_date: str, t2_date: str,
                     threshold: float = 0.5, scale: int = 10,
                     window_days: int = 30,
                     export_path: Optional[str] = None) -> Dict[str, Any]:
    """
    NDVI/NDBI time-series differencing over the AOI/date range (§7.4).

    Returns change fractions, per-index means, and (when `export_path` is
    given and the export succeeds) the path of a written change-mask GeoTIFF.
    """
    ee = require_gee()
    aoi = _rect(ee, bounds)

    t1 = s2_composite(ee, aoi, t1_date, window_days)
    t2 = s2_composite(ee, aoi, t2_date, window_days)

    ndvi1 = t1.normalizedDifference(["B8", "B4"]).rename("ndvi")
    ndvi2 = t2.normalizedDifference(["B8", "B4"]).rename("ndvi")
    ndbi1 = t1.normalizedDifference(["B11", "B8"]).rename("ndbi")
    ndbi2 = t2.normalizedDifference(["B11", "B8"]).rename("ndbi")

    ndvi_delta = ndvi2.subtract(ndvi1).rename("ndvi_delta")
    ndbi_delta = ndbi2.subtract(ndbi1).rename("ndbi_delta")
    ndvi_diff = ndvi_delta.abs()
    ndbi_diff = ndbi_delta.abs()

    mask = ndvi_diff.gt(threshold).Or(ndbi_diff.gt(threshold)).rename("change")

    # sharedInputs=True: both reducers run over the same bands, giving
    # `{band}_mean` and `{band}_count` keys for every band in the stack.
    reducers = (ee.Reducer.mean()
                .combine(ee.Reducer.count(), sharedInputs=True))
    stack = (mask.rename("changed")
             .addBands(ndvi_delta).addBands(ndbi_delta)
             .addBands(ndvi_diff.gt(threshold).rename("changed_ndvi"))
             .addBands(ndbi_diff.gt(threshold).rename("changed_ndbi")))

    stats = stack.reduceRegion(
        reducer=reducers, geometry=aoi, scale=scale,
        maxPixels=int(1e9), bestEffort=True).getInfo() or {}

    # Authoritative changed area, computed inside GEE with pixelArea() so it
    # accounts for the latitude-dependent pixel size of EPSG:4326 rather than
    # multiplying a pixel count by a nominal GSD.
    # Both bands are restricted to the same valid (cloud-free, in-composite)
    # footprint, so `changed / aoi` is a fraction of what was actually observed
    # rather than of the full rectangle.
    valid = mask.mask()
    area_stats = (mask.multiply(ee.Image.pixelArea()).rename("changed_m2")
                  .addBands(ee.Image.pixelArea().updateMask(valid).rename("aoi_m2"))
                  .reduceRegion(reducer=ee.Reducer.sum(), geometry=aoi, scale=scale,
                                maxPixels=int(1e9), bestEffort=True).getInfo() or {})
    changed_m2 = area_stats.get("changed_m2")
    aoi_m2 = area_stats.get("aoi_m2")

    def _f(key: str) -> Optional[float]:
        v = stats.get(key)
        return None if v is None else float(v)

    changed_fraction = _f("changed_mean")
    ndvi_delta_mean = _f("ndvi_delta_mean")
    ndbi_delta_mean = _f("ndbi_delta_mean")
    pixel_count = _f("changed_count")

    # Direction of change: NDVI down + NDBI up is the built-up-growth signature.
    if ndvi_delta_mean is None or ndbi_delta_mean is None:
        direction = "unknown"
    elif abs(ndvi_delta_mean) < 0.01 and abs(ndbi_delta_mean) < 0.01:
        direction = "unchanged"
    elif ndbi_delta_mean > 0 and ndvi_delta_mean < 0:
        direction = "built_up_increase"
    elif ndbi_delta_mean < 0 and ndvi_delta_mean > 0:
        direction = "vegetation_increase"
    elif ndvi_delta_mean < 0:
        direction = "vegetation_decrease"
    else:
        direction = "vegetation_increase"

    mask_path = None
    if export_path:
        mask_path = _download_geotiff(ee, mask.toByte(), aoi, scale, export_path)

    return {
        "changed_fraction": None if changed_fraction is None else round(changed_fraction, 5),
        "changed_area_m2": None if changed_m2 is None else round(float(changed_m2), 1),
        "changed_area_ha": None if changed_m2 is None else round(float(changed_m2) / 10_000, 2),
        "aoi_area_ha": None if aoi_m2 is None else round(float(aoi_m2) / 10_000, 2),
        "changed_fraction_ndvi": (None if _f("changed_ndvi_mean") is None
                                  else round(_f("changed_ndvi_mean"), 5)),
        "changed_fraction_ndbi": (None if _f("changed_ndbi_mean") is None
                                  else round(_f("changed_ndbi_mean"), 5)),
        "ndvi_delta_mean": None if ndvi_delta_mean is None else round(ndvi_delta_mean, 5),
        "ndbi_delta_mean": None if ndbi_delta_mean is None else round(ndbi_delta_mean, 5),
        "direction": direction,
        "threshold": threshold,
        "scale_m": scale,
        "composite_window_days": window_days,
        "pixels_evaluated": None if pixel_count is None else int(pixel_count),
        "t1_date": t1_date,
        "t2_date": t2_date,
        "source": "COPERNICUS/S2_SR_HARMONIZED",
        "mask_path": mask_path,
    }


# ---------------------------------------------------------------------------
# §7.5 SAR — Sentinel-1 GRD backscatter (optional acceleration only)
# ---------------------------------------------------------------------------
def sentinel1_grd(bounds: Sequence[float], start: str, end: str,
                  polarisation: str = "VV", scale: int = 10,
                  export_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Already-processed Sentinel-1 GRD backscatter (dB) over the AOI (§7.5).

    This is **optional acceleration, not a replacement**: the deterministic
    local dB pipeline (§6.5, Phase 3) stays the primary and only offline path
    and is mandatory for user-uploaded RISAT / other non-catalog rasters that
    GEE does not host.  Callers must opt in explicitly.
    """
    ee = require_gee()
    aoi = _rect(ee, bounds)

    col = (ee.ImageCollection("COPERNICUS/S1_GRD")
           .filterBounds(aoi).filterDate(start, end)
           .filter(ee.Filter.eq("instrumentMode", "IW"))
           .filter(ee.Filter.listContains("transmitterReceiverPolarisation", polarisation))
           .select(polarisation))

    count = int(col.size().getInfo())
    if count == 0:
        return {
            "available": False,
            "reason": (f"Sentinel-1 GRD has no {polarisation} IW coverage for this AOI "
                       f"between {start} and {end}"),
            "image_count": 0,
            "polarisation": polarisation,
        }

    img = col.median().clip(aoi)   # already in dB in the GEE GRD product
    stats = img.reduceRegion(
        reducer=(ee.Reducer.mean()
                 .combine(ee.Reducer.percentile([10, 50, 90]), sharedInputs=True)),
        geometry=aoi, scale=scale, maxPixels=int(1e9), bestEffort=True).getInfo() or {}

    tif_path = None
    if export_path:
        tif_path = _download_geotiff(ee, img, aoi, scale, export_path)

    return {
        "available": True,
        "reason": f"{count} Sentinel-1 GRD {polarisation} scenes composited",
        "image_count": count,
        "polarisation": polarisation,
        "scale_m": scale,
        "backscatter_db": {k: (None if v is None else round(float(v), 3))
                           for k, v in stats.items()},
        "source": "COPERNICUS/S1_GRD",
        "date_range": [start, end],
        "tif_path": tif_path,
    }
