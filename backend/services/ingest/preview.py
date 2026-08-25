import json
from pathlib import Path
from typing import Any, Dict, Optional, Tuple, Union
import numpy as np
from PIL import Image
import rasterio

from services.ingest.preprocessor import prepare


def generate_previews(
    meta: Dict[str, Any],
    source: Union[str, np.ndarray],
    output_dir: Union[str, Path],
    modality: str = "OPTICAL",
) -> Dict[str, Any]:
    """
    Generates 1024px preview PNG, 256px thumbnail PNG, and preview_meta.json.
    Frontend uses preview_meta.json to map canvas pixel coordinates to lat/lng.
    """
    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    if isinstance(source, str):
        with rasterio.open(source) as src:
            arr = src.read()
    else:
        arr = source

    # Prepare model-ready float32 (H, W, 3) in [0, 1]
    rgb_float = prepare(meta, arr, modality)

    # Convert to 8-bit uint8 RGB image
    rgb_uint8 = np.clip(rgb_float * 255.0, 0, 255).astype(np.uint8)
    img = Image.fromarray(rgb_uint8, mode="RGB")

    orig_w, orig_h = meta.get("width", img.width), meta.get("height", img.height)

    # 1. Preview PNG (1024 px on long edge)
    scale_1024 = min(1.0, 1024.0 / max(orig_w, orig_h))
    preview_w = max(1, int(round(orig_w * scale_1024)))
    preview_h = max(1, int(round(orig_h * scale_1024)))
    preview_img = img.resize((preview_w, preview_h), resample=Image.Resampling.LANCZOS)
    preview_file = out_path / "preview.png"
    preview_img.save(preview_file, format="PNG", optimize=True)

    # 2. Thumbnail PNG (256 px on long edge)
    scale_256 = min(1.0, 256.0 / max(orig_w, orig_h))
    thumb_w = max(1, int(round(orig_w * scale_256)))
    thumb_h = max(1, int(round(orig_h * scale_256)))
    thumb_img = img.resize((thumb_w, thumb_h), resample=Image.Resampling.LANCZOS)
    thumb_file = out_path / "thumb.png"
    thumb_img.save(thumb_file, format="PNG", optimize=True)

    # 3. Preview Meta JSON
    scale_factor = preview_w / float(orig_w) if orig_w > 0 else 1.0
    preview_meta = {
        "width": preview_w,
        "height": preview_h,
        "orig_width": orig_w,
        "orig_height": orig_h,
        "bounds_wgs84": meta.get("bounds_wgs84"),
        "gsd_m": meta.get("gsd_m"),
        "scale_factor": round(scale_factor, 6),
    }
    meta_file = out_path / "preview_meta.json"
    with open(meta_file, "w", encoding="utf-8") as f:
        json.dump(preview_meta, f, indent=2)

    return {
        "preview_path": str(preview_file),
        "thumb_path": str(thumb_file),
        "preview_meta_path": str(meta_file),
        "preview_meta": preview_meta,
    }
