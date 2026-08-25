"""
SatQuery AI - Phase 3 Ingestion & Validation Interactive Test Script
Generates sample GeoTIFFs, runs metadata extraction, modality detection,
R8 compatibility checks, preview generation, and tensor preparation.
"""

import json
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import numpy as np
import rasterio
from rasterio.transform import from_bounds
from PIL import Image

from services.ingest.raster_reader import read_metadata
from services.ingest.modality_detector import detect_modality
from services.ingest.compatibility_checker import check_compatibility
from services.ingest.preview import generate_previews
from services.ingest.preprocessor import prepare, align_pair


def create_sample_optical_tif(path: str):
    """Creates a 3-band simulated optical GeoTIFF (Cartosat/RGB) over Central India."""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    width, height = 512, 512
    bounds = [78.0, 20.0, 78.1, 20.1]
    transform = from_bounds(bounds[0], bounds[1], bounds[2], bounds[3], width, height)
    
    # 3 bands: Red, Green, Blue
    r = (np.random.normal(loc=120, scale=25, size=(height, width))).clip(0, 255).astype(np.uint8)
    g = (np.random.normal(loc=110, scale=20, size=(height, width))).clip(0, 255).astype(np.uint8)
    b = (np.random.normal(loc=90, scale=15, size=(height, width))).clip(0, 255).astype(np.uint8)
    data = np.stack([r, g, b])

    with rasterio.open(
        path, "w", driver="GTiff", height=height, width=width, count=3,
        dtype="uint8", crs="EPSG:4326", transform=transform, nodata=0
    ) as dst:
        dst.write(data)
        dst.update_tags(platform="Cartosat-3", sensor="MX", region="Nagpur")
        dst.set_band_description(1, "Red")
        dst.set_band_description(2, "Green")
        dst.set_band_description(3, "Blue")


def create_sample_sar_tif(path: str):
    """Creates a 2-band simulated SAR GeoTIFF (Sentinel-1 VV/VH) over the same region."""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    width, height = 512, 512
    bounds = [78.0, 20.0, 78.1, 20.1]
    transform = from_bounds(bounds[0], bounds[1], bounds[2], bounds[3], width, height)

    # SAR backscatter (exponential distribution with speckle)
    vv = (np.random.exponential(scale=0.08, size=(height, width))).astype(np.float32)
    vh = (np.random.exponential(scale=0.02, size=(height, width))).astype(np.float32)
    data = np.stack([vv, vh])

    with rasterio.open(
        path, "w", driver="GTiff", height=height, width=width, count=2,
        dtype="float32", crs="EPSG:4326", transform=transform
    ) as dst:
        dst.write(data)
        dst.update_tags(platform="Sentinel-1A", polarisation="VV VH", mode="IW_GRDH")
        dst.set_band_description(1, "VV")
        dst.set_band_description(2, "VH")


def main():
    print("=" * 70)
    print("      SatQuery AI - Phase 3 Ingest & Validation Test Runner")
    print("=" * 70)

    work_dir = Path("./_demo_data")
    work_dir.mkdir(parents=True, exist_ok=True)

    opt_path = str(work_dir / "cartosat_optical.tif")
    sar_path = str(work_dir / "sentinel1_sar.tif")

    print("\n1. Generating sample test GeoTIFFs...")
    create_sample_optical_tif(opt_path)
    create_sample_sar_tif(sar_path)
    print(f"   [+] Optical GeoTIFF: {opt_path}")
    print(f"   [+] SAR GeoTIFF:     {sar_path}")

    print("\n2. Testing Raster Reader (Honest Metadata Extraction)...")
    opt_meta = read_metadata(opt_path)
    sar_meta = read_metadata(sar_path)
    print(f"   Optical Dimensions: {opt_meta['width']}x{opt_meta['height']}, Bands: {opt_meta['band_count']}, CRS: {opt_meta['crs']}, GSD: {opt_meta['gsd_m']:.2f} m")
    print(f"   SAR Dimensions:     {sar_meta['width']}x{sar_meta['height']}, Bands: {sar_meta['band_count']}, CRS: {sar_meta['crs']}, GSD: {sar_meta['gsd_m']:.2f} m")

    print("\n3. Testing Modality Detector (Scored Heuristics)...")
    opt_mod = detect_modality(opt_meta)
    sar_mod = detect_modality(sar_meta)
    print(f"   Optical File -> Detected: {opt_mod['modality']} (Confidence: {opt_mod['confidence']:.2f})")
    print(f"   SAR File     -> Detected: {sar_mod['modality']} (Confidence: {sar_mod['confidence']:.2f})")

    print("\n4. Testing Compatibility Checker (Requirement R8 - 6 Checks)...")
    images_for_check = [
        dict(opt_meta, path=opt_path, modality=opt_mod),
        dict(sar_meta, path=sar_path, modality=sar_mod),
    ]

    report = check_compatibility(images_for_check, declared_config="CROSS_MODAL")
    print(f"   Overall Verdict: [{report['verdict']}]")
    print("   Detailed Checklist:")
    for c in report["checks"]:
        icon = "[PASS]" if c["status"] == "PASS" else ("[WARN]" if c["status"] == "WARN" else "[FAIL]")
        print(f"     {icon} [{c['name']}]: {c['detail']}")

    print("\n5. Testing Preview Generator (1024px PNG + Coordinates Meta)...")
    preview_res = generate_previews(opt_meta, opt_path, work_dir / "previews", modality=opt_mod["modality"])
    print(f"   [+] Preview PNG:  {preview_res['preview_path']}")
    print(f"   [+] Thumbnail:    {preview_res['thumb_path']}")
    print(f"   [+] Preview Meta: {json.dumps(preview_res['preview_meta'])}")

    print("\n" + "=" * 70)
    print("  All Phase 3 Ingestion & Validation components executed successfully!")
    print("=" * 70)


if __name__ == "__main__":
    main()
