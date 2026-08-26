"""
SatQuery AI — VRSBench Dataset & Manifest Builder (PRD §7.1)

VRSBench: captions, QA pairs, and referring expressions for remote sensing.
Used by:
  - M2 caption+VQA SFT (weights 0.15 + 0.15 + 0.10 in mixture)
  - M3 grounding SFT + eval

Kaggle dataset paths:
  /kaggle/input/vrsbench/

Manifest fields: image_path, caption, qa[], referring[{phrase, bbox}], split
"""

import json
import os
from pathlib import Path
from typing import Optional

from PIL import Image

try:
    import torch
    from torch.utils.data import Dataset
except ImportError:
    torch = None
    Dataset = object


class VRSBenchDataset(Dataset):
    """VRSBench dataset for captions, VQA, and referring expressions.

    PRD §7.1 — manifest fields: image_path, caption, qa[], referring[{phrase, bbox}]

    Each row can produce multiple training examples depending on the task:
      - "caption": one example per image
      - "vqa": one example per QA pair
      - "ground": one example per referring expression
    """

    def __init__(
        self,
        manifest: str,
        split: str = "train",
        task: str = "vqa",
        processor=None,
        max_image_size: int = 512,
    ):
        """
        Args:
            manifest: Path to the VRSBench manifest JSON.
            split: "train", "val", or "test".
            task: "caption", "vqa", or "ground" — determines which examples to yield.
            processor: Optional image processor (e.g. Qwen2VL processor).
            max_image_size: Max dimension for image resizing.
        """
        with open(manifest, "r") as f:
            all_rows = json.load(f)
        split_rows = [r for r in all_rows if r["split"] == split]

        # Flatten rows based on task
        self.examples = []
        for r in split_rows:
            img = r["image_path"]

            if task == "caption" and r.get("caption"):
                self.examples.append({
                    "image": img,
                    "n_images": 1,
                    "task": "caption",
                    "answer": r["caption"],
                    "fmt": {},
                })

            elif task == "vqa":
                for qa in r.get("qa", []):
                    self.examples.append({
                        "image": img,
                        "n_images": 1,
                        "task": "vqa",
                        "answer": qa["answer"],
                        "fmt": {"q": qa["question"]},
                    })

            elif task == "ground":
                for ref in r.get("referring", []):
                    # Format bbox as normalised coordinates
                    bbox = ref["bbox"]  # [x1, y1, x2, y2] normalised or pixel
                    self.examples.append({
                        "image": img,
                        "n_images": 1,
                        "task": "ground",
                        "answer": f"({bbox[0]},{bbox[1]}),({bbox[2]},{bbox[3]})",
                        "fmt": {"phrase": ref["phrase"]},
                    })

        self.processor = processor
        self.max_image_size = max_image_size

    def __len__(self):
        return len(self.examples)

    def __getitem__(self, i: int):
        ex = self.examples[i]

        # Load image
        img = Image.open(ex["image"]).convert("RGB")
        if max(img.size) > self.max_image_size:
            img.thumbnail((self.max_image_size, self.max_image_size), Image.LANCZOS)

        return {
            "image": img,
            "image_path": ex["image"],
            "n_images": ex["n_images"],
            "task": ex["task"],
            "answer": ex["answer"],
            "fmt": ex["fmt"],
        }


# ── Manifest Builder ────────────────────────────────────────────────────────

def build_manifest(
    data_root: str,
    output: str = "vrsbench_manifest.json",
):
    """Index a local VRSBench archive into a JSON manifest.

    Expected layout:
      {data_root}/
        images/           — image files
        captions.json     — {image_id: caption}
        qa.json           — [{image_id, question, answer}]
        referring.json    — [{image_id, phrase, bbox}]
        splits.json       — {image_id: split}

    Or alternative:
      {data_root}/
        Images/
        train_captions.json, val_captions.json, ...
        train_qa.json, val_qa.json, ...

    Args:
        data_root: Root directory of VRSBench
        output: Output manifest path
    """
    root = Path(data_root)
    manifest_map = {}  # image_id → manifest entry

    # ── Load splits ─────────────────────────────────────────────────────
    split_map = {}
    split_files = [root / "splits.json", root / "split.json"]
    for sf in split_files:
        if sf.exists():
            with open(sf, "r") as f:
                split_map = json.load(f)
            break

    # ── Load captions ───────────────────────────────────────────────────
    caption_files = [
        root / "captions.json",
        root / "caption.json",
    ]
    # Also check per-split files
    for split in ["train", "val", "test"]:
        caption_files.append(root / f"{split}_captions.json")

    # ── Load main JSON files (VRSBench_train.json or split json files) ─────────
    json_candidates = list(root.glob("*.json")) + list(root.rglob("*.json"))
    for jf in json_candidates:
        if "manifest" in jf.name.lower():
            continue
        try:
            with open(jf, "r") as f:
                data = json.load(f)

            if isinstance(data, list):
                for item in data:
                    img_id = str(item.get("image_id", item.get("img_id", item.get("id", ""))))
                    if not img_id:
                        continue
                    entry = manifest_map.setdefault(img_id, _empty_entry(img_id, root))

                    if "caption" in item and not entry["caption"]:
                        entry["caption"] = item["caption"]
                    if "question" in item and "answer" in item:
                        entry["qa"].append({"question": item["question"], "answer": str(item["answer"])})
                    if "qa" in item and isinstance(item["qa"], list):
                        entry["qa"].extend(item["qa"])
                    if "referring" in item and isinstance(item["referring"], list):
                        entry["referring"].extend(item["referring"])

            elif isinstance(data, dict):
                for img_id, item in data.items():
                    entry = manifest_map.setdefault(str(img_id), _empty_entry(str(img_id), root))
                    if isinstance(item, str):
                        entry["caption"] = item
                    elif isinstance(item, dict):
                        if "caption" in item: entry["caption"] = item["caption"]
                        if "qa" in item: entry["qa"].extend(item["qa"])
        except Exception:
            pass

    # ── Assign splits and resolve image paths ───────────────────────────
    manifest = []
    for img_id, entry in manifest_map.items():
        entry["split"] = split_map.get(img_id, "train")
        # Try to resolve image path
        img_path = _find_image(root, img_id)
        if img_path:
            entry["image_path"] = str(img_path)
        manifest.append(entry)

    print(f"VRSBench manifest: {len(manifest)} images")
    total_qa = sum(len(e["qa"]) for e in manifest)
    total_ref = sum(len(e["referring"]) for e in manifest)
    total_cap = sum(1 for e in manifest if e["caption"])
    print(f"  Captions: {total_cap}, QA pairs: {total_qa}, Referring: {total_ref}")

    with open(output, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"Written to {output}")

    return manifest


def _empty_entry(img_id: str, root: Path) -> dict:
    return {
        "image_id": img_id,
        "image_path": str(root / "images" / f"{img_id}.png"),
        "caption": "",
        "qa": [],
        "referring": [],
        "split": "train",
    }


def _find_image(root: Path, img_id: str) -> Optional[Path]:
    search_dirs = [root / "images", root / "Images", root / "Images_train", root / "Images_val", root]
    extensions = [".png", ".jpg", ".jpeg", ".tif", ".tiff"]
    for d in search_dirs:
        if not d.exists():
            continue
        for ext in extensions:
            candidate = d / f"{img_id}{ext}"
            if candidate.exists():
                return candidate

    # Recursive fallback
    for ext in extensions:
        matches = list(root.rglob(f"{img_id}{ext}"))
        if matches:
            return matches[0]

    return None


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Build VRSBench manifest")
    parser.add_argument("--data-root", required=True, help="VRSBench dataset root")
    parser.add_argument("--output", default="vrsbench_manifest.json")
    args = parser.parse_args()

    build_manifest(data_root=args.data_root, output=args.output)
