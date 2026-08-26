"""
SatQuery AI — CDVQA Dataset & Manifest Builder (PRD §7.1)

Change Detection Visual Question Answering dataset.
Used by M2 change-VQA SFT (weight 0.20 in training mixture).

Kaggle dataset paths:
  /kaggle/input/cdvqa/

Manifest fields: t1_path, t2_path, question, answer, qtype, split
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


class CDVQADataset(Dataset):
    """CDVQA dataset for change-detection VQA on bi-temporal imagery.

    PRD §7.1 — manifest fields: t1_path, t2_path, question, answer, qtype

    Each example contains TWO images (before and after) and a question
    about what changed between them.
    """

    def __init__(
        self,
        manifest: str,
        split: str = "train",
        processor=None,
        max_image_size: int = 512,
    ):
        with open(manifest, "r") as f:
            all_rows = json.load(f)
        self.rows = [r for r in all_rows if r["split"] == split]
        self.processor = processor
        self.max_image_size = max_image_size

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, i: int):
        r = self.rows[i]

        # Load both temporal images
        img1 = Image.open(r["t1_path"]).convert("RGB")
        img2 = Image.open(r["t2_path"]).convert("RGB")

        if max(img1.size) > self.max_image_size:
            img1.thumbnail((self.max_image_size, self.max_image_size), Image.LANCZOS)
        if max(img2.size) > self.max_image_size:
            img2.thumbnail((self.max_image_size, self.max_image_size), Image.LANCZOS)

        return {
            "image_1": img1,
            "image_2": img2,
            "image_1_path": r["t1_path"],
            "image_2_path": r["t2_path"],
            "question": r["question"],
            "answer": r["answer"],
            "qtype": r.get("qtype", "unknown"),
            "n_images": 2,
            "task": "change_vqa",
            "fmt": {"q": r["question"]},
        }


# ── Manifest Builder ────────────────────────────────────────────────────────

def build_manifest(
    data_root: str,
    output: str = "cdvqa_manifest.json",
):
    """Index a local CDVQA archive into a JSON manifest.

    Expected layout:
      {data_root}/
        images/
          A/          — "before" images (t1)
          B/          — "after" images (t2)
        QA/
          train.json
          val.json
          test.json

    Or flat layout:
      {data_root}/
        A/
        B/
        train_qa.json / val_qa.json / test_qa.json

    Args:
        data_root: Root directory of CDVQA
        output: Output manifest path
    """
    root = Path(data_root)
    manifest = []

    for split in ["train", "val", "test"]:
        # Find QA file
        qa_candidates = [
            root / "QA" / f"{split}.json",
            root / f"{split}_qa.json",
            root / f"qa_{split}.json",
            root / f"{split}.json",
        ]
        qa_file = next((f for f in qa_candidates if f.exists()), None)
        if qa_file is None:
            print(f"  No QA file found for split '{split}', skipping")
            continue

        with open(qa_file, "r") as f:
            qa_data = json.load(f)

        # Process QA entries
        qa_list = qa_data if isinstance(qa_data, list) else qa_data.get("questions", qa_data.get("data", []))

        for item in qa_list:
            img_id = str(item.get("image_id", item.get("img_id", item.get("id", ""))))

            # Find t1 and t2 image paths
            t1_path = _find_temporal_image(root, img_id, "A")
            t2_path = _find_temporal_image(root, img_id, "B")

            if t1_path is None or t2_path is None:
                continue

            question = item.get("question", "")
            answer = str(item.get("answer", ""))
            qtype = item.get("type", item.get("qtype", "unknown"))

            manifest.append({
                "t1_path": str(t1_path),
                "t2_path": str(t2_path),
                "question": question,
                "answer": answer,
                "qtype": qtype,
                "image_id": img_id,
                "split": split,
                "source": "cdvqa",
            })

    print(f"CDVQA manifest: {len(manifest)} entries")
    for split in ["train", "val", "test"]:
        count = sum(1 for r in manifest if r["split"] == split)
        print(f"  {split}: {count}")

    with open(output, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"Written to {output}")

    return manifest


def _find_temporal_image(root: Path, img_id: str, temporal_dir: str) -> Optional[Path]:
    """Find an image in the A/ (before) or B/ (after) directories."""
    search_dirs = [
        root / "images" / temporal_dir,
        root / temporal_dir,
        root / "Images" / temporal_dir,
    ]
    extensions = [".png", ".jpg", ".jpeg", ".tif", ".tiff"]

    for d in search_dirs:
        if not d.exists():
            continue
        for ext in extensions:
            candidate = d / f"{img_id}{ext}"
            if candidate.exists():
                return candidate
    return None


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Build CDVQA manifest")
    parser.add_argument("--data-root", required=True, help="CDVQA dataset root")
    parser.add_argument("--output", default="cdvqa_manifest.json")
    args = parser.parse_args()

    build_manifest(data_root=args.data_root, output=args.output)
