"""
SatQuery AI — BigEarthNet S1+S2 Dataset & Manifest Builder (PRD §7.1)

Co-registered Sentinel-1 (VV, VH) + Sentinel-2 (12-band) patches with text
annotations and 19-class multilabel ground truth.

Used by:
  - M1 (RS-CLIP contrastive adaptation)
  - M5 (Fusion head)

Kaggle dataset paths (default):
  /kaggle/input/bigearthnet-s2/  — Sentinel-2 patches
  /kaggle/input/bigearthnet-s1/  — Sentinel-1 patches
  /kaggle/input/bigearthnet-text/ — Text annotations (Ben-ge)
"""

import json
import os
import random
from pathlib import Path
from typing import Optional

import numpy as np
import torch
from torch.utils.data import Dataset

try:
    import rasterio
except ImportError:
    rasterio = None


# ── 19-class CLC label set (BigEarthNet v2 simplified) ─────────────────────
LABEL_NAMES = [
    "Urban fabric", "Industrial or commercial units", "Arable land",
    "Permanent crops", "Pastures", "Complex cultivation patterns",
    "Land principally occupied by agriculture", "Agro-forestry areas",
    "Broad-leaved forest", "Coniferous forest", "Mixed forest",
    "Natural grasslands", "Moors and heathland", "Sclerophyllous vegetation",
    "Transitional woodland-shrub", "Beaches, dunes, sands",
    "Inland wetlands", "Coastal wetlands", "Inland waters",
]
NUM_CLASSES = len(LABEL_NAMES)

# Sentinel-2 bands in the order BigEarthNet stores them (12 of 13; B10 excluded)
S2_BANDS = ["B02", "B03", "B04", "B05", "B06", "B07", "B08", "B8A", "B11", "B12", "B01", "B09"]


class BigEarthNetTextDataset(Dataset):
    """Co-registered Sentinel-1 (VV,VH) + Sentinel-2 (12 band) patches with text annotations.

    PRD §7.1 — manifest fields: s2_path, s1_path, labels[19], text, split

    Normalisation (PRD §7.1):
      - S2 L2A reflectance: clip(s2 / 10000.0, 0, 0.3) / 0.3
        Do NOT per-image min-max — it destroys the absolute reflectance
        relationships the text describes.
      - S1 GRD linear power → dB → fixed range:
        clip(10 * log10(clip(s1, 1e-6, None)), -25, 0), then (s1 + 25.0) / 25.0

    Non-obvious rule (PRD §7.1):
      Optical and SAR augmentations must be applied jointly with identical
      parameters. Independent flips destroy the co-registration that is the
      entire point of the dataset.
    """

    def __init__(
        self,
        manifest: str,
        split: str,
        tokenizer=None,
        augment: bool = True,
        patch_size: int = 120,
    ):
        with open(manifest, "r") as f:
            all_rows = json.load(f)
        self.rows = [r for r in all_rows if r["split"] == split]
        self.tok = tokenizer
        self.augment = augment and (split == "train")
        self.patch_size = patch_size

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, i: int):
        r = self.rows[i]
        s2 = self._read_stack(r["s2_path"], S2_BANDS)  # (12, 120, 120) float32
        s1 = self._read_stack(r["s1_path"], ["VV", "VH"])  # (2, 120, 120) float32

        # ── Sentinel-2 normalisation (PRD §7.1) ────────────────────────────
        # L2A reflectance is scaled by 10000; clip at 0.3 which covers
        # everything except cloud/snow, then normalise.
        s2 = np.clip(s2 / 10000.0, 0, 0.3) / 0.3

        # ── Sentinel-1 normalisation (PRD §7.1) ────────────────────────────
        # GRD linear power → dB → fixed range normalisation
        s1 = np.clip(10 * np.log10(np.clip(s1, 1e-6, None)), -25, 0)
        s1 = (s1 + 25.0) / 25.0

        # ── Joint augmentation (PRD §7.1: independent flips destroy co-reg)
        if self.augment:
            s2, s1 = self._joint_flip_rotate(s2, s1)

        result = {
            "optical": torch.from_numpy(s2).float(),   # (12, H, W)
            "sar": torch.from_numpy(s1).float(),        # (2, H, W)
            "labels": torch.tensor(r["labels"]).float(),  # (19,) multilabel
        }

        if self.tok is not None and "text" in r:
            result["text"] = self.tok(r["text"])[0]
        elif "text" in r:
            result["text_raw"] = r["text"]

        return result

    def _read_stack(self, patch_dir: str, band_names: list) -> np.ndarray:
        """Read individual band TIFs from a BigEarthNet patch directory and stack them."""
        bands = []
        patch_path = Path(patch_dir)
        patch_id = patch_path.name

        for band in band_names:
            # BigEarthNet naming convention: {patch_id}_{band}.tif
            band_file = patch_path / f"{patch_id}_{band}.tif"
            if not band_file.exists():
                # Fallback: try without patch_id prefix
                candidates = list(patch_path.glob(f"*_{band}.tif"))
                if candidates:
                    band_file = candidates[0]
                else:
                    # Return zeros if band file not found
                    bands.append(np.zeros((self.patch_size, self.patch_size), dtype=np.float32))
                    continue

            if rasterio is not None:
                with rasterio.open(band_file) as src:
                    arr = src.read(1).astype(np.float32)
            else:
                # Fallback for environments without rasterio
                from PIL import Image
                arr = np.array(Image.open(band_file)).astype(np.float32)

            # Resize to uniform patch size if needed
            if arr.shape != (self.patch_size, self.patch_size):
                from scipy.ndimage import zoom
                zy = self.patch_size / arr.shape[0]
                zx = self.patch_size / arr.shape[1]
                arr = zoom(arr, (zy, zx), order=1)

            bands.append(arr)

        return np.stack(bands, axis=0)

    @staticmethod
    def _joint_flip_rotate(s2: np.ndarray, s1: np.ndarray):
        """Apply identical spatial augmentation to both modalities.

        PRD §7.1: "optical and SAR augmentations must be applied jointly
        with identical parameters. Independent flips destroy the
        co-registration that is the entire point of the dataset."
        """
        # Random horizontal flip
        if random.random() > 0.5:
            s2 = np.flip(s2, axis=2).copy()
            s1 = np.flip(s1, axis=2).copy()
        # Random vertical flip
        if random.random() > 0.5:
            s2 = np.flip(s2, axis=1).copy()
            s1 = np.flip(s1, axis=1).copy()
        # Random 90° rotation (0, 1, 2, or 3 times)
        k = random.randint(0, 3)
        if k > 0:
            s2 = np.rot90(s2, k, axes=(1, 2)).copy()
            s1 = np.rot90(s1, k, axes=(1, 2)).copy()
        return s2, s1


# ── Manifest Builder ────────────────────────────────────────────────────────

def build_manifest(
    s2_root: str,
    s1_root: str,
    text_file: Optional[str] = None,
    labels_file: Optional[str] = None,
    output: str = "bigearthnet_manifest.json",
    split_file: Optional[str] = None,
):
    """Index local BigEarthNet-S1+S2 archives into a JSON manifest.

    Args:
        s2_root: Root directory of BigEarthNet-S2 patches
                 (e.g. /kaggle/input/bigearthnet-s2/BigEarthNet-S2/)
        s1_root: Root directory of BigEarthNet-S1 patches
                 (e.g. /kaggle/input/bigearthnet-s1/BigEarthNet-S1/)
        text_file: JSON file with text annotations (Ben-ge format)
        labels_file: JSON file mapping patch_id → list of 19-class labels
        output: Path to write the manifest JSON
        split_file: Optional JSON/CSV file with patch_id → split mapping
    """
    s2_path = Path(s2_root)
    s1_path = Path(s1_root)

    # Load text annotations if available
    text_map = {}
    if text_file and Path(text_file).exists():
        with open(text_file, "r") as f:
            text_data = json.load(f)
        # Handle various formats
        if isinstance(text_data, dict):
            text_map = text_data
        elif isinstance(text_data, list):
            text_map = {item.get("patch_id", item.get("id", "")): item.get("text", item.get("caption", "")) for item in text_data}

    # Load labels if available
    labels_map = {}
    if labels_file and Path(labels_file).exists():
        with open(labels_file, "r") as f:
            labels_data = json.load(f)
        if isinstance(labels_data, dict):
            labels_map = labels_data

    # Load splits if available
    split_map = {}
    if split_file and Path(split_file).exists():
        with open(split_file, "r") as f:
            split_data = json.load(f)
        if isinstance(split_data, dict):
            split_map = split_data

    # Find all S2 patches
    s2_patches = sorted([d for d in s2_path.iterdir() if d.is_dir()])
    print(f"Found {len(s2_patches)} S2 patches")

    manifest = []
    skipped = 0

    for s2_patch_dir in s2_patches:
        patch_id = s2_patch_dir.name

        # Derive corresponding S1 patch ID (replace S2 prefix with S1)
        s1_patch_id = patch_id.replace("_S2", "_S1").replace("S2A", "S1A").replace("S2B", "S1B")

        # Try to find matching S1 patch
        s1_patch_dir = s1_path / s1_patch_id
        if not s1_patch_dir.exists():
            # Try alternative naming
            alt_candidates = list(s1_path.glob(f"*{patch_id.split('_')[-1]}*"))
            if alt_candidates:
                s1_patch_dir = alt_candidates[0]
                s1_patch_id = s1_patch_dir.name
            else:
                skipped += 1
                continue

        # Get labels (19-class binary vector)
        label_names = labels_map.get(patch_id, [])
        labels_vec = [1 if name in label_names else 0 for name in LABEL_NAMES]

        # Get text annotation
        text = text_map.get(patch_id, "")

        # Get split
        split = split_map.get(patch_id, "train")

        manifest.append({
            "patch_id": patch_id,
            "s2_path": str(s2_patch_dir),
            "s1_path": str(s1_patch_dir),
            "labels": labels_vec,
            "label_names": label_names,
            "text": text,
            "split": split,
        })

    print(f"Manifest: {len(manifest)} entries, {skipped} skipped (no S1 match)")

    with open(output, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"Written to {output}")

    return manifest


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Build BigEarthNet manifest")
    parser.add_argument("--s2-root", required=True, help="BigEarthNet-S2 patches root")
    parser.add_argument("--s1-root", required=True, help="BigEarthNet-S1 patches root")
    parser.add_argument("--text-file", default=None, help="Text annotations JSON")
    parser.add_argument("--labels-file", default=None, help="Labels JSON (patch_id → label names)")
    parser.add_argument("--split-file", default=None, help="Split mapping JSON")
    parser.add_argument("--output", default="bigearthnet_manifest.json", help="Output manifest path")
    args = parser.parse_args()

    build_manifest(
        s2_root=args.s2_root,
        s1_root=args.s1_root,
        text_file=args.text_file,
        labels_file=args.labels_file,
        output=args.output,
        split_file=args.split_file,
    )
