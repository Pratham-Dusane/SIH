"""
SatQuery AI — RSVQA-LR / RSVQA-HR Dataset & Manifest Builder (PRD §7.1)

Remote Sensing Visual Question Answering datasets.
Used by M2 VQA SFT (weight 0.30 in training mixture).

Kaggle dataset paths:
  /kaggle/input/rsvqa-lr/  — RSVQA Low Resolution (Sentinel-2)
  /kaggle/input/rsvqa-hr/  — RSVQA High Resolution (aerial)

Manifest fields: image_path, question, answer, qtype, split
"""

import json
import os
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image

try:
    import torch
    from torch.utils.data import Dataset
except ImportError:
    torch = None
    Dataset = object


class RSVQADataset(Dataset):
    """RSVQA dataset for Visual Question Answering on remote sensing imagery.

    PRD §7.1 — manifest fields: image_path, question, answer, qtype

    Supports both RSVQA-LR (Sentinel-2 based, ~770K QA pairs) and
    RSVQA-HR (aerial imagery, ~1M QA pairs).
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

        # Load image
        img = Image.open(r["image_path"]).convert("RGB")
        if max(img.size) > self.max_image_size:
            img.thumbnail((self.max_image_size, self.max_image_size), Image.LANCZOS)

        return {
            "image": img,
            "image_path": r["image_path"],
            "question": r["question"],
            "answer": r["answer"],
            "qtype": r.get("qtype", "unknown"),
            "n_images": 1,
            "task": "vqa",
            "fmt": {"q": r["question"]},
        }


# ── Manifest Builder ────────────────────────────────────────────────────────

def build_manifest(
    data_root: str,
    variant: str = "lr",
    output: Optional[str] = None,
):
    """Index a local RSVQA-LR or RSVQA-HR archive into a JSON manifest.

    Supports the standard RSVQA directory layout:
      {data_root}/
        Images/          — image files (PNG/TIFF)
        Questions/       — JSON with questions
        Answers/         — JSON with answers

    Or the alternative flat layout with JSON files at root:
      {data_root}/
        images/
        {variant}_questions_train.json
        {variant}_answers_train.json
        ...

    Args:
        data_root: Root directory of the RSVQA dataset
        variant: "lr" or "hr"
        output: Output manifest path (defaults to rsvqa_{variant}_manifest.json)
    """
    root = Path(data_root)
    if output is None:
        output = f"rsvqa_{variant}_manifest.json"

    manifest = []

    # Try standard RSVQA JSON format
    for split in ["train", "val", "test"]:
        # Look for questions and answers files
        q_candidates = [
            root / f"Questions" / f"{split}.json",
            root / f"{variant}_questions_{split}.json",
            root / f"questions_{split}.json",
            root / f"{split}_questions.json",
        ]
        a_candidates = [
            root / f"Answers" / f"{split}.json",
            root / f"{variant}_answers_{split}.json",
            root / f"answers_{split}.json",
            root / f"{split}_answers.json",
        ]

        q_file = next((f for f in q_candidates if f.exists()), None)
        a_file = next((f for f in a_candidates if f.exists()), None)

        if q_file is None:
            print(f"  [{variant.upper()}] No questions file found for split '{split}', skipping")
            continue

        with open(q_file, "r") as f:
            questions_data = json.load(f)

        # Load answers
        answers_map = {}
        if a_file is not None:
            with open(a_file, "r") as f:
                answers_data = json.load(f)
            # Build answer lookup
            if isinstance(answers_data, dict) and "answers" in answers_data:
                for a in answers_data["answers"]:
                    answers_map[a.get("question_id", a.get("id"))] = a.get("answer", "")
            elif isinstance(answers_data, list):
                for a in answers_data:
                    answers_map[a.get("question_id", a.get("id"))] = a.get("answer", "")

        # Process questions
        q_list = questions_data.get("questions", questions_data) if isinstance(questions_data, dict) else questions_data
        if isinstance(q_list, dict):
            q_list = q_list.get("questions", list(q_list.values()))

        for q in q_list:
            if isinstance(q, dict):
                qid = q.get("question_id", q.get("id"))
                question = q.get("question", "")
                qtype = q.get("type", q.get("qtype", "unknown"))
                img_id = q.get("image_id", q.get("img_id", ""))

                # Find image path
                img_path = _find_image(root, img_id)
                if img_path is None:
                    continue

                answer = answers_map.get(qid, q.get("answer", ""))

                manifest.append({
                    "image_path": str(img_path),
                    "question": question,
                    "answer": str(answer),
                    "qtype": qtype,
                    "split": split,
                    "source": f"rsvqa-{variant}",
                })

    print(f"RSVQA-{variant.upper()} manifest: {len(manifest)} entries")
    for split in ["train", "val", "test"]:
        count = sum(1 for r in manifest if r["split"] == split)
        print(f"  {split}: {count}")

    with open(output, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"Written to {output}")

    return manifest


def _find_image(root: Path, img_id) -> Optional[Path]:
    """Find an image file by ID in common RSVQA directory layouts."""
    img_id_str = str(img_id)
    search_dirs = [root / "Images", root / "images", root]
    extensions = [".png", ".tif", ".tiff", ".jpg", ".jpeg"]

    for d in search_dirs:
        if not d.exists():
            continue
        for ext in extensions:
            candidate = d / f"{img_id_str}{ext}"
            if candidate.exists():
                return candidate
    return None


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Build RSVQA manifest")
    parser.add_argument("--data-root", required=True, help="RSVQA dataset root directory")
    parser.add_argument("--variant", default="lr", choices=["lr", "hr"], help="RSVQA variant")
    parser.add_argument("--output", default=None, help="Output manifest path")
    args = parser.parse_args()

    build_manifest(data_root=args.data_root, variant=args.variant, output=args.output)
