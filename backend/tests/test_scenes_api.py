import os
from pathlib import Path
import numpy as np
import pytest
from fastapi.testclient import TestClient
import rasterio
from rasterio.transform import from_bounds

from main import app
from core.storage import get_storage


@pytest.fixture
def client():
    return TestClient(app)


def _create_sample_geotiff(path: str, count: int = 3, dtype: str = "uint8", crs: str = "EPSG:4326", bounds: list = None, tags: dict = None):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    width, height = 128, 128
    if bounds is None:
        bounds = [78.0, 20.0, 78.1, 20.1]
    transform = from_bounds(bounds[0], bounds[1], bounds[2], bounds[3], width, height)
    
    if dtype == "float32":
        data = (np.random.rand(count, height, width) * 10).astype(np.float32)
    else:
        data = (np.random.rand(count, height, width) * 255).astype(np.uint8)

    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=height,
        width=width,
        count=count,
        dtype=dtype,
        crs=crs,
        transform=transform,
    ) as dst:
        dst.write(data)
        if tags:
            dst.update_tags(**tags)


def test_upload_and_scene_confirmation_flow(client: TestClient, tmp_path: Path):
    """Test full upload, scene confirmation, checklist validation, and retrieval flow."""
    # 1. Create temporary geotiff
    tif_path = str(tmp_path / "cartosat_rgb.tif")
    _create_sample_geotiff(
        tif_path, count=3, dtype="uint8", crs="EPSG:4326", tags={"sensor": "Cartosat-3"}
    )

    # 2. Get signed upload URL
    resp_signed = client.post(
        "/api/uploads/signed-url",
        json={
            "filename": "cartosat_rgb.tif",
            "contentType": "image/tiff",
            "sceneRole": "single",
            "workspaceId": "ws_demo",
        },
    )
    assert resp_signed.status_code == 200
    signed_data = resp_signed.json()
    object_path = signed_data["object_path"]
    scene_id = signed_data["scene_id"]

    # 3. Direct upload via local upload route
    with open(tif_path, "rb") as f:
        file_bytes = f.read()

    resp_upload = client.post(
        f"/api/uploads/local/{object_path}",
        content=file_bytes,
        headers={"Content-Type": "image/tiff"},
    )
    assert resp_upload.status_code == 200

    # 4. Confirm scene
    confirm_payload = {
        "workspace_id": "ws_demo",
        "input_config": "SINGLE",
        "name": "Cartosat Urban Test",
        "images": [
            {
                "role": "single",
                "original_filename": "cartosat_rgb.tif",
                "object_path": object_path,
            }
        ],
    }
    resp_confirm = client.post("/api/scenes/confirm", json=confirm_payload)
    assert resp_confirm.status_code == 200
    scene = resp_confirm.json()

    assert scene["id"] == scene_id
    assert scene["workspace_id"] == "ws_demo"
    assert scene["compatibility"]["verdict"] in ("PASS", "WARN")
    assert len(scene["images"]) == 1
    assert scene["images"][0]["preview_url"] is not None
    assert scene["images"][0]["thumb_url"] is not None
    assert scene["images"][0]["metadata"]["georeferenced"] is True

    # 5. List scenes
    resp_list = client.get("/api/scenes?workspace_id=ws_demo")
    assert resp_list.status_code == 200
    scenes_list = resp_list.json()
    assert any(s["id"] == scene_id for s in scenes_list)

    # 6. Get scene by ID
    resp_get = client.get(f"/api/scenes/{scene_id}")
    assert resp_get.status_code == 200
    assert resp_get.json()["id"] == scene_id

    # 7. Set ROI
    roi_geo = {"type": "Polygon", "coordinates": [[[78.0, 20.0], [78.1, 20.0], [78.1, 20.1], [78.0, 20.1], [78.0, 20.0]]]}
    resp_roi = client.post(f"/api/scenes/{scene_id}/roi", json={"type": "Feature", "geometry": roi_geo})
    assert resp_roi.status_code == 200
    assert resp_roi.json()["roi"]["geometry"]["type"] == "Polygon"

    # 8. Revalidate
    resp_reval = client.post(f"/api/scenes/{scene_id}/revalidate")
    assert resp_reval.status_code == 200
    assert resp_reval.json()["compatibility"]["verdict"] in ("PASS", "WARN")

    # 9. Delete scene
    resp_del = client.delete(f"/api/scenes/{scene_id}")
    assert resp_del.status_code == 200


def test_compatibility_fail_blocks_and_returns_422(client: TestClient, tmp_path: Path):
    """Test Requirement R8: Failing compatibility checklist returns HTTP 422 with checklist report."""
    # Create single optical image
    tif_path = str(tmp_path / "single_opt.tif")
    _create_sample_geotiff(tif_path, count=3, tags={"sensor": "Cartosat"})

    object_path = "workspaces/ws_demo/scenes/scene_fail_test/optical/single_opt.tif"
    with open(tif_path, "rb") as f:
        client.post(f"/api/uploads/local/{object_path}", content=f.read())

    # Send confirmation declared as CROSS_MODAL with only 1 image (violates C1 & C2)
    payload = {
        "workspace_id": "ws_demo",
        "input_config": "CROSS_MODAL",
        "images": [
            {
                "role": "optical",
                "original_filename": "single_opt.tif",
                "object_path": object_path,
            }
        ],
    }

    resp = client.post("/api/scenes/confirm", json=payload)
    assert resp.status_code == 422
    err_body = resp.json()
    assert "detail" in err_body
    assert err_body["detail"]["verdict"] == "FAIL"
    assert any(c["status"] == "FAIL" for c in err_body["detail"]["checks"])
