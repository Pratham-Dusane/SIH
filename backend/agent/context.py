"""
Execution context — the runtime environment tools receive.

Provides access to scene data, image arrays, prior tool results,
and a transient artifact store for passing data between tool steps.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np
import rasterio

from models.scene import Scene


class ExecutionContext:
    """
    Constructed per-query.  Gives tools access to:
    - scene metadata and images
    - raw raster arrays (loaded lazily)
    - artifacts produced by prior tool steps
    - prior tool results (for chaining)
    """

    def __init__(self, scene: Scene, storage, vlm_backend: str = "gemini"):
        self.scene = scene
        self._storage = storage
        self.vlm_backend = vlm_backend
        self.results: Dict[str, Any] = {}        # step_id -> ToolResult
        self._artifacts: Dict[str, Any] = {}     # key -> numpy array or other data
        self._artifact_gsd: Dict[str, float] = {}  # key -> GSD (m) when not the scene grid
        self._array_cache: Dict[str, np.ndarray] = {}

    # ------------------------------------------------------------------
    # Scene metadata helpers
    # ------------------------------------------------------------------
    def scene_georeferenced(self) -> bool:
        return any(img.metadata.georeferenced for img in self.scene.images)

    def scene_gsd_x_m(self) -> Optional[float]:
        for img in self.scene.images:
            if img.metadata.gsd_m is not None:
                return img.metadata.gsd_m
            if img.metadata.gsd_x is not None:
                return img.metadata.gsd_x
        return None

    def scene_gsd_y_m(self) -> Optional[float]:
        for img in self.scene.images:
            if img.metadata.gsd_m is not None:
                return img.metadata.gsd_m
            if img.metadata.gsd_y is not None:
                return img.metadata.gsd_y
        return None

    def scene_overlap_fraction(self) -> Optional[float]:
        """Get the overlap fraction from compatibility checks."""
        if self.scene.compatibility and self.scene.compatibility.checks:
            for c in self.scene.compatibility.checks:
                if c.name == "spatial_overlap" and c.status != "N/A":
                    try:
                        # detail looks like "97.0% of image 1 footprint..."
                        pct_str = c.detail.split("%")[0].strip()
                        return float(pct_str) / 100.0
                    except (ValueError, IndexError):
                        pass
        return None

    # ------------------------------------------------------------------
    # AOI + acquisition window — metadata handed to Earth Engine (§7.3-§7.5).
    # The uploaded pixel array is never sent; only these numbers are.
    # ------------------------------------------------------------------
    def scene_bounds_wgs84(self) -> Optional[List[float]]:
        """[west, south, east, north] in EPSG:4326, or None if not georeferenced."""
        fn = getattr(self.scene, "bounds_wgs84", None)
        if callable(fn):
            return fn()
        return fn  # a plain attribute (test doubles)

    def scene_acquisition_window(self, pad_days: int = 45) -> tuple:
        """
        (start, end) ISO dates for a catalog query.  Falls back to a padded
        window around whatever single date is known, and to (None, None) when
        the scene carries no acquisition date at all — callers must refuse
        rather than invent a date range.
        """
        fn = getattr(self.scene, "acquisition_window", None)
        start, end = fn() if callable(fn) else (
            getattr(self.scene, "acquired_start", None),
            getattr(self.scene, "acquired_end", None),
        )
        if start and not end:
            end = _shift_date(start, pad_days)
        if end and not start:
            start = _shift_date(end, -pad_days)
        if start and end and start == end:
            start, end = _shift_date(start, -pad_days), _shift_date(end, pad_days)
        return start, end

    def scene_t1_t2_dates(self) -> tuple:
        """(t1_date, t2_date) for a bi-temporal scene, either may be None."""
        return getattr(self.scene, "t1_date", None), getattr(self.scene, "t2_date", None)

    def artifact_path(self, filename: str) -> str:
        """
        A writable local path under this scene's derived-artifact prefix.
        Used by the GEE tools to land an exported GeoTIFF in the artifact store.
        """
        rel = (f"workspaces/{getattr(self.scene, 'workspace_id', 'ws')}"
               f"/scenes/{self.scene.id}/artifacts/{filename}")
        if self._storage is not None and hasattr(self._storage, "local_path"):
            return self._storage.local_path(rel)
        return rel

    # ------------------------------------------------------------------
    # Array access — lazy load from storage
    # ------------------------------------------------------------------
    def _load_array(self, image_path: str) -> Optional[np.ndarray]:
        """Load a raster file and return its data as a channel-first numpy array."""
        if image_path in self._array_cache:
            return self._array_cache[image_path]
        try:
            local = self._storage.local_path(image_path)
            with rasterio.open(local) as src:
                arr = src.read()  # (bands, H, W)
            self._array_cache[image_path] = arr
            return arr
        except Exception:
            return None

    def _find_image_by_role(self, *roles: str):
        """Find the first scene image matching one of the given roles."""
        for img in self.scene.images:
            if img.role in roles:
                return img
        return None

    def _find_image_by_modality(self, *modalities: str):
        """Find the first scene image matching one of the given modalities."""
        for img in self.scene.images:
            if img.modality.modality in modalities:
                return img
        return None

    def get_optical_array(self) -> Optional[np.ndarray]:
        """Get the optical/multispectral image array (C, H, W)."""
        img = self._find_image_by_role("optical", "single", "t1", "t2")
        if img is None:
            img = self._find_image_by_modality("OPTICAL", "MULTISPECTRAL")
        if img is None:
            return None
        return self._load_array(img.object_path)

    def get_sar_array(self) -> Optional[np.ndarray]:
        """Get the SAR image array (C, H, W)."""
        img = self._find_image_by_role("sar")
        if img is None:
            img = self._find_image_by_modality("SAR")
        if img is None:
            return None
        return self._load_array(img.object_path)

    def get_image_array(self, which: str) -> Optional[np.ndarray]:
        """
        Get image array by abstract position.
        'a' = first image (or optical in cross-modal, t1 in bi-temporal)
        'b' = second image (or sar in cross-modal, t2 in bi-temporal)
        """
        if len(self.scene.images) < 2:
            if which == "a" and self.scene.images:
                return self._load_array(self.scene.images[0].object_path)
            return None

        if which == "a":
            return self._load_array(self.scene.images[0].object_path)
        elif which == "b":
            return self._load_array(self.scene.images[1].object_path)
        return None

    def _ordered_images(self) -> list:
        """
        Scene images in the order the VLM must see them.  For a bi-temporal
        pair that is strictly t1 then t2 — every change template in the
        gateway names "image 1" as the earlier date, so the order is part of
        the contract, not a convenience.
        """
        images = list(self.scene.images)
        if getattr(self.scene, "input_config", None) == "BI_TEMPORAL":
            order = {"t1": 0, "t2": 1}
            images.sort(key=lambda i: order.get(i.role, 2))
        elif getattr(self.scene, "input_config", None) == "CROSS_MODAL":
            order = {"optical": 0, "sar": 1}
            images.sort(key=lambda i: order.get(i.role, 2))
        return images

    def model_ready_images(self) -> List[bytes]:
        """
        Return preview PNGs as bytes for VLM consumption.
        Falls back to reading the raw raster and encoding as PNG.
        """
        import io
        from PIL import Image

        result = []
        for img in self._ordered_images():
            # Prefer the preview PNG
            if img.preview_path:
                try:
                    local = self._storage.local_path(img.preview_path)
                    with open(local, "rb") as f:
                        result.append(f.read())
                    continue
                except Exception:
                    pass
            # Fallback: load array and encode
            arr = self._load_array(img.object_path)
            if arr is not None:
                from services.ingest.preprocessor import prepare
                meta = img.metadata.model_dump()
                prepared = prepare(meta, arr, img.modality.modality)
                pil = Image.fromarray((prepared * 255).astype("uint8"))
                buf = io.BytesIO()
                pil.save(buf, format="PNG")
                result.append(buf.getvalue())
        return result

    # ------------------------------------------------------------------
    # Artifact store — for passing data between tool steps
    # ------------------------------------------------------------------
    def store_artifact(self, key: str, data: Any,
                       gsd_m: Optional[float] = None) -> None:
        """
        Store an artifact for downstream steps.

        `gsd_m` records the ground sample distance of *this* array when it does
        not share the uploaded raster's grid — a GEE-derived mask is on GEE's
        grid, so measuring it with the scene GSD would silently produce a wrong
        area.  geo_stats prefers this value when present.
        """
        self._artifacts[key] = data
        if gsd_m is not None:
            self._artifact_gsd[key] = float(gsd_m)

    def artifact_gsd(self, ref: str) -> Optional[float]:
        """GSD recorded for an artifact, resolving step references like get_artifact."""
        if ref in self._artifact_gsd:
            return self._artifact_gsd[ref]
        parts = ref.split(".")
        if len(parts) >= 3 and parts[1] == "artifacts":
            step_id, art_key = parts[0], parts[2]
            result = self.results.get(step_id)
            if result is not None and getattr(result, "artifacts", None):
                resolved = result.artifacts.get(art_key)
                if isinstance(resolved, str):
                    return self._artifact_gsd.get(resolved)
        return None

    def get_artifact(self, ref: str) -> Optional[Any]:
        """
        Resolve an artifact reference.  Supports:
        - plain key: "ndvi_mask"
        - step reference: "s2.artifacts.mask" -> looks up results[s2].artifacts["mask"]
        """
        # Direct key lookup
        if ref in self._artifacts:
            return self._artifacts[ref]

        # Step reference: "s2.artifacts.mask"
        parts = ref.split(".")
        if len(parts) >= 3 and parts[1] == "artifacts":
            step_id = parts[0]
            art_key = parts[2]
            if step_id in self.results:
                result = self.results[step_id]
                if hasattr(result, "artifacts") and art_key in result.artifacts:
                    resolved_key = result.artifacts[art_key]
                    if resolved_key in self._artifacts:
                        return self._artifacts[resolved_key]
        return None

    def prior(self, tool_name: str):
        """Get the ToolResult from a prior step that used the given tool."""
        for result in self.results.values():
            if hasattr(result, "tool") and result.tool == tool_name:
                return result
        return None


def _shift_date(iso_date: str, days: int) -> str:
    """Shift an ISO YYYY-MM-DD date by `days`.  Returns the input unchanged on failure."""
    from datetime import date, timedelta
    try:
        y, m, d = (int(p) for p in iso_date.split("-")[:3])
        return (date(y, m, d) + timedelta(days=days)).isoformat()
    except Exception:
        return iso_date
