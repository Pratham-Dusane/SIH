import math
from pathlib import Path
import numpy as np
import pytest
import rasterio
from rasterio.transform import from_bounds, from_origin

from services.ingest.raster_reader import read_metadata, UnsupportedFormat


def test_read_geotiff_geographic_crs(tmp_path: Path):
    """Test reading GeoTIFF in EPSG:4326 and converting GSD to metres."""
    tif_path = str(tmp_path / "geo_4326.tif")
    width, height = 100, 100
    # Centered around lat 20.0 deg N (e.g. India)
    west, south, east, north = 78.0, 19.9, 78.1, 20.0
    transform = from_bounds(west, south, east, north, width, height)
    
    data = (np.random.rand(3, height, width) * 255).astype(np.uint8)

    with rasterio.open(
        tif_path,
        "w",
        driver="GTiff",
        height=height,
        width=width,
        count=3,
        dtype="uint8",
        crs="EPSG:4326",
        transform=transform,
        nodata=0,
    ) as dst:
        dst.write(data)
        dst.update_tags(sensor="Cartosat-3", area="Nagpur")

    meta = read_metadata(tif_path)

    assert meta["driver"] == "GTiff"
    assert meta["width"] == 100
    assert meta["height"] == 100
    assert meta["band_count"] == 3
    assert meta["crs"] == "EPSG:4326"
    assert meta["georeferenced"] is True
    assert meta["nodata"] == 0
    assert len(meta["band_stats"]) == 3
    assert meta["tags"].get("sensor") == "Cartosat-3"

    # Test GSD in metres conversion:
    # 0.1 deg / 100 px = 0.001 deg/px
    # GSD_x_m approx 0.001 * 111320 * cos(19.95 deg) approx 104.6m
    lat_center = (south + north) / 2.0
    expected_gsd_x_m = 0.001 * 111320.0 * math.cos(math.radians(lat_center))
    expected_gsd_y_m = 0.001 * 110540.0
    expected_gsd_m = (expected_gsd_x_m + expected_gsd_y_m) / 2.0

    assert meta["gsd_m"] is not None
    assert abs(meta["gsd_m"] - expected_gsd_m) < 1.0


def test_read_geotiff_projected_crs(tmp_path: Path):
    """Test reading GeoTIFF in projected UTM CRS (EPSG:32643)."""
    tif_path = str(tmp_path / "utm.tif")
    width, height = 64, 64
    transform = from_origin(300000, 2200000, 10.0, 10.0)
    data = (np.random.rand(1, height, width) * 1000).astype(np.float32)

    with rasterio.open(
        tif_path,
        "w",
        driver="GTiff",
        height=height,
        width=width,
        count=1,
        dtype="float32",
        crs="EPSG:32643",
        transform=transform,
    ) as dst:
        dst.write(data)

    meta = read_metadata(tif_path)

    assert meta["crs"] == "EPSG:32643"
    assert meta["georeferenced"] is True
    assert meta["gsd_m"] == 10.0
    assert meta["bounds_wgs84"] is not None
    assert len(meta["bounds_wgs84"]) == 4


def test_read_unreferenced_raster_returns_none(tmp_path: Path):
    """Test that missing CRS and transform are NOT defaulted to fake values."""
    tif_path = str(tmp_path / "unreferenced.tif")
    width, height = 50, 50
    data = np.ones((1, height, width), dtype=np.uint8) * 128

    with rasterio.open(
        tif_path,
        "w",
        driver="GTiff",
        height=height,
        width=width,
        count=1,
        dtype="uint8",
    ) as dst:
        dst.write(data)

    meta = read_metadata(tif_path)

    assert meta["crs"] is None
    assert meta["georeferenced"] is False
    assert meta["bounds_native"] is None
    assert meta["bounds_wgs84"] is None
    assert meta["gsd_m"] is None


def test_unsupported_format_rejection(tmp_path: Path):
    """Test rejection of non-geotiff formats unless benchmark_mode is enabled."""
    from PIL import Image
    png_path = str(tmp_path / "sample.png")
    Image.new("RGB", (64, 64), color=(255, 0, 0)).save(png_path)

    # Without benchmark_mode -> raise UnsupportedFormat
    with pytest.raises(UnsupportedFormat):
        read_metadata(png_path, benchmark_mode=False)

    # With benchmark_mode -> allowed
    meta = read_metadata(png_path, benchmark_mode=True)
    assert meta["width"] == 64
    assert meta["height"] == 64
    assert meta["band_count"] == 3
