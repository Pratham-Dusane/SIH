"""
SatQuery AI — Weighted Multi-Task Mixture Sampler for M2 Training (PRD §7.3)

PRD §7.3 — Training mixture sampling weights (not raw sizes — RSVQA-LR
is far larger than VRSBench and will swamp it):

    | Source                              | Task             | Weight |
    |-------------------------------------|------------------|--------|
    | RSVQA-LR + RSVQA-HR train           | vqa              | 0.30   |
    | VRSBench train (QA)                 | vqa              | 0.15   |
    | VRSBench train (captions)           | caption          | 0.15   |
    | VRSBench train (referring)          | ground           | 0.10   |
    | CDVQA train                         | change_vqa       | 0.20   |
    | Synthesised change descriptions     | change_describe  | 0.05   |
    | Synthesised optical+SAR QA          | cross_modal      | 0.05   |
"""

import json
import math
import random
from pathlib import Path
from typing import Optional

from PIL import Image

try:
    import torch
    from torch.utils.data import Dataset, Sampler
except ImportError:
    torch = None
    Dataset = object
    Sampler = object


class MixedDataset(Dataset):
    """Combines multiple source datasets with weighted sampling for M2 training.

    Each item is a dict with at minimum:
      - image (or image_1 + image_2 for bi-temporal/cross-modal)
      - n_images: int (1 or 2)
      - task: str (vqa, caption, ground, change_vqa, change_describe, cross_modal)
      - answer: str
      - fmt: dict (template format kwargs)
    """

    # PRD §7.3 exact weights
    DEFAULT_WEIGHTS = {
        "rsvqa": 0.30,
        "vrsbench_qa": 0.15,
        "vrsbench_caption": 0.15,
        "vrsbench_ground": 0.10,
        "cdvqa": 0.20,
        "synth_change": 0.05,
        "synth_crossmodal": 0.05,
    }

    def __init__(
        self,
        sources: dict,
        total_samples_per_epoch: int = 50000,
        weights: Optional[dict] = None,
        seed: int = 42,
    ):
        """
        Args:
            sources: Dict mapping source name → list of example dicts.
                     Keys must match DEFAULT_WEIGHTS keys.
            total_samples_per_epoch: How many samples constitute one "epoch".
            weights: Optional custom weights. Defaults to PRD §7.3 weights.
            seed: Random seed for reproducibility.
        """
        self.weights = weights or self.DEFAULT_WEIGHTS
        self.total_samples = total_samples_per_epoch
        self.rng = random.Random(seed)

        # Build flat indexed arrays per source
        self.source_data = {}
        for name, examples in sources.items():
            if name in self.weights and len(examples) > 0:
                self.source_data[name] = examples

        # Pre-compute how many samples from each source per epoch
        self.samples_per_source = {}
        active_weight_sum = sum(self.weights.get(k, 0) for k in self.source_data)
        for name in self.source_data:
            w = self.weights.get(name, 0) / max(active_weight_sum, 1e-6)
            self.samples_per_source[name] = max(1, int(w * total_samples_per_epoch))

        # Build the epoch index
        self._build_epoch_index()

    def _build_epoch_index(self):
        """Build a shuffled list of (source_name, index) tuples for one epoch."""
        self.index = []
        for name, count in self.samples_per_source.items():
            data = self.source_data[name]
            n = len(data)
            for _ in range(count):
                idx = self.rng.randint(0, n - 1)
                self.index.append((name, idx))
        self.rng.shuffle(self.index)

    def __len__(self):
        return len(self.index)

    def __getitem__(self, i: int):
        source_name, idx = self.index[i]
        return self.source_data[source_name][idx]

    def reshuffle(self, epoch: int = 0):
        """Reshuffle for a new epoch with a different seed."""
        self.rng = random.Random(42 + epoch)
        self._build_epoch_index()


def load_sources(
    rsvqa_manifest: Optional[str] = None,
    vrsbench_manifest: Optional[str] = None,
    cdvqa_manifest: Optional[str] = None,
    synth_change_manifest: Optional[str] = None,
    synth_crossmodal_manifest: Optional[str] = None,
    split: str = "train",
) -> dict:
    """Load all source manifests and return a dict ready for MixedDataset.

    Args:
        rsvqa_manifest: Path to RSVQA manifest (combined LR+HR)
        vrsbench_manifest: Path to VRSBench manifest
        cdvqa_manifest: Path to CDVQA manifest
        synth_change_manifest: Path to synthesised change descriptions
        synth_crossmodal_manifest: Path to synthesised cross-modal QA
        split: Which split to load ("train", "val", "test")

    Returns:
        Dict[str, list[dict]] mapping source name to list of training examples
    """
    sources = {}

    # RSVQA (LR + HR combined)
    if rsvqa_manifest and Path(rsvqa_manifest).exists():
        with open(rsvqa_manifest, "r") as f:
            data = json.load(f)
        rows = [r for r in data if r.get("split") == split]
        # Ensure consistent format
        for r in rows:
            r.setdefault("n_images", 1)
            r.setdefault("task", "vqa")
            r.setdefault("fmt", {"q": r.get("question", "")})
            r.setdefault("image", r.get("image_path", ""))
        sources["rsvqa"] = rows
        print(f"  rsvqa: {len(rows)} examples")

    # VRSBench — split into 3 task variants
    if vrsbench_manifest and Path(vrsbench_manifest).exists():
        with open(vrsbench_manifest, "r") as f:
            data = json.load(f)
        split_rows = [r for r in data if r.get("split") == split]

        # QA examples
        vrs_qa = []
        for r in split_rows:
            for qa in r.get("qa", []):
                vrs_qa.append({
                    "image": r["image_path"],
                    "n_images": 1,
                    "task": "vqa",
                    "answer": qa["answer"],
                    "fmt": {"q": qa["question"]},
                })
        sources["vrsbench_qa"] = vrs_qa
        print(f"  vrsbench_qa: {len(vrs_qa)} examples")

        # Caption examples
        vrs_cap = []
        for r in split_rows:
            if r.get("caption"):
                vrs_cap.append({
                    "image": r["image_path"],
                    "n_images": 1,
                    "task": "caption",
                    "answer": r["caption"],
                    "fmt": {},
                })
        sources["vrsbench_caption"] = vrs_cap
        print(f"  vrsbench_caption: {len(vrs_cap)} examples")

        # Referring/grounding examples
        vrs_ground = []
        for r in split_rows:
            for ref in r.get("referring", []):
                bbox = ref["bbox"]
                vrs_ground.append({
                    "image": r["image_path"],
                    "n_images": 1,
                    "task": "ground",
                    "answer": f"({bbox[0]},{bbox[1]}),({bbox[2]},{bbox[3]})",
                    "fmt": {"phrase": ref["phrase"]},
                })
        sources["vrsbench_ground"] = vrs_ground
        print(f"  vrsbench_ground: {len(vrs_ground)} examples")

    # CDVQA
    if cdvqa_manifest and Path(cdvqa_manifest).exists():
        with open(cdvqa_manifest, "r") as f:
            data = json.load(f)
        rows = [r for r in data if r.get("split") == split]
        for r in rows:
            r.setdefault("n_images", 2)
            r.setdefault("task", "change_vqa")
            r.setdefault("fmt", {"q": r.get("question", "")})
        sources["cdvqa"] = rows
        print(f"  cdvqa: {len(rows)} examples")

    # Synthesised change descriptions
    if synth_change_manifest and Path(synth_change_manifest).exists():
        with open(synth_change_manifest, "r") as f:
            data = json.load(f)
        rows = [r for r in data if r.get("split") == split]
        sources["synth_change"] = rows
        print(f"  synth_change: {len(rows)} examples")

    # Synthesised cross-modal QA
    if synth_crossmodal_manifest and Path(synth_crossmodal_manifest).exists():
        with open(synth_crossmodal_manifest, "r") as f:
            data = json.load(f)
        rows = [r for r in data if r.get("split") == split]
        sources["synth_crossmodal"] = rows
        print(f"  synth_crossmodal: {len(rows)} examples")

    return sources


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Test mixture dataset loading")
    parser.add_argument("--rsvqa-manifest", default=None)
    parser.add_argument("--vrsbench-manifest", default=None)
    parser.add_argument("--cdvqa-manifest", default=None)
    parser.add_argument("--synth-change-manifest", default=None)
    parser.add_argument("--synth-crossmodal-manifest", default=None)
    args = parser.parse_args()

    sources = load_sources(
        rsvqa_manifest=args.rsvqa_manifest,
        vrsbench_manifest=args.vrsbench_manifest,
        cdvqa_manifest=args.cdvqa_manifest,
        synth_change_manifest=args.synth_change_manifest,
        synth_crossmodal_manifest=args.synth_crossmodal_manifest,
    )

    print(f"\nTotal sources loaded: {len(sources)}")
    total = sum(len(v) for v in sources.values())
    print(f"Total examples: {total}")

    if sources:
        ds = MixedDataset(sources, total_samples_per_epoch=min(total, 1000))
        print(f"MixedDataset length: {len(ds)}")
        print(f"Samples per source: {ds.samples_per_source}")
