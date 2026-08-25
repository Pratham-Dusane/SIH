import json
from pathlib import Path
import numpy as np
from PIL import Image
import pytest

from services.ingest.preview import generate_previews


def test_preview_generation(tmp_path: Path):
    """Test generation of preview PNG, thumb PNG, and preview_meta.json."""
    arr = (np.random.rand(3, 1200, 1600) * 255).astype(np.float32)
    meta = {
        "width": 1600,
        "height": 1200,
        "bounds_wgs84": [78.0, 20.0, 78.5, 20.5],
        "gsd_m": 10.0,
        "band_count": 3,
        "band_stats": [],
    }

    out_dir = tmp_path / "previews"
    res = generate_previews(meta, arr, out_dir, modality="OPTICAL")

    preview_file = Path(res["preview_path"])
    thumb_file = Path(res["thumb_path"])
    meta_file = Path(res["preview_meta_path"])

    assert preview_file.is_file()
    assert thumb_file.is_file()
    assert meta_file.is_file()

    with Image.open(preview_file) as p_img:
        # Long edge should be 1024
        assert max(p_img.size) == 1024
        assert p_img.mode == "RGB"

    with Image.open(thumb_file) as t_img:
        # Long edge should be 256
        assert max(t_img.size) == 256
        assert t_img.mode == "RGB"

    with open(meta_file, "r", encoding="utf-8") as f:
        meta_data = json.load(f)
        assert meta_data["orig_width"] == 1600
        assert meta_data["orig_height"] == 1200
        assert meta_data["width"] == 1024
        assert abs(meta_data["scale_factor"] - (1024 / 1600)) < 1e-4
        assert meta_data["bounds_wgs84"] == [78.0, 20.0, 78.5, 20.5]
