"""
SatQuery AI — Synthesise Change Descriptions from LEVIR-CD Masks (PRD §7.3)

PRD §7.3: "From a LEVIR-CD binary mask compute changed-area fraction,
connected-component count, and centroid quadrants, then render a sentence
from a template bank of ~30 phrasings."

Templated text is fine here — the model is learning the *mapping*, and
template diversity plus real imagery generalises better than a small
hand-written set.

Used by M2 change_describe SFT (weight 0.05 in training mixture).

Kaggle dataset path: /kaggle/input/levir-cd/
"""

import json
import os
import random
from pathlib import Path
from typing import Optional

import numpy as np
from PIL import Image

try:
    from scipy import ndimage
except ImportError:
    ndimage = None


# ── Template bank (~30 phrasings as specified in PRD §7.3) ──────────────────

TEMPLATES_OVERALL = [
    "Approximately {pct}% of the scene has changed between the two acquisitions.",
    "About {pct}% of the total area shows observable change.",
    "Change is detected across {pct}% of the scene.",
    "Roughly {pct}% of the imaged area underwent modification.",
    "The imagery reveals that {pct}% of the scene experienced change.",
]

TEMPLATES_LOCATION = [
    "The changes are concentrated in the {quadrant} of the scene.",
    "Most of the change is localised to the {quadrant} portion of the image.",
    "The {quadrant} region of the scene shows the highest concentration of change.",
    "Change activity is primarily observed in the {quadrant}.",
    "The {quadrant} area exhibits the most significant modifications.",
]

TEMPLATES_CLUSTERS = [
    "{n} distinct clusters of change were identified.",
    "There are {n} separate changed regions visible.",
    "{n} individual change zones can be distinguished.",
    "The change is distributed across {n} discrete clusters.",
    "Analysis reveals {n} spatially separated areas of change.",
]

TEMPLATES_TYPE = [
    "The pattern is consistent with new building construction.",
    "The changes suggest new urban development or construction activity.",
    "New structures or building clusters appear to have been constructed.",
    "The change signature indicates land conversion for development.",
    "Built-up area expansion is the most likely explanation for the observed changes.",
]

TEMPLATES_MINIMAL_CHANGE = [
    "Very little change is observed between the two time periods, with only {pct}% of the scene affected.",
    "The scene is largely stable between acquisitions, with minimal change ({pct}%).",
    "Change is negligible at {pct}% of the total area.",
]

TEMPLATES_COMPOUND = [
    "Approximately {pct}% of the scene changed, concentrated in the {quadrant}, where {n} new building clusters appeared.",
    "Change covers {pct}% of the area, with {n} distinct zones mainly in the {quadrant} of the scene.",
    "The {quadrant} shows {n} new development clusters, affecting {pct}% of the total scene.",
    "About {pct}% of the scene was modified, with {n} separate change regions in the {quadrant}.",
    "{n} clusters of change were detected in the {quadrant}, covering approximately {pct}% of the scene.",
    "Between the two dates, {pct}% of the scene changed. {n} distinct change zones are visible, primarily in the {quadrant}.",
    "The analysis reveals {n} areas of change in the {quadrant}, totalling about {pct}% of the scene.",
]


def _quadrant_name(cy: float, cx: float, h: int, w: int) -> str:
    """Determine the quadrant name from centroid coordinates."""
    y_rel = cy / h
    x_rel = cx / w

    if y_rel < 0.33:
        v = "north"
    elif y_rel > 0.67:
        v = "south"
    else:
        v = "central"

    if x_rel < 0.33:
        h_name = "west"
    elif x_rel > 0.67:
        h_name = "east"
    else:
        h_name = ""

    if v == "central" and h_name == "":
        return "centre"
    elif h_name == "":
        return v
    elif v == "central":
        return h_name
    else:
        return f"{v}-{h_name}"


def analyse_mask(mask: np.ndarray) -> dict:
    """Extract statistics from a binary change mask.

    Returns:
        dict with keys: pct, n_clusters, quadrant, cy, cx
    """
    h, w = mask.shape
    total_pixels = h * w
    changed_pixels = int(np.sum(mask > 0))
    pct = round(100.0 * changed_pixels / total_pixels, 1)

    # Connected components
    if ndimage is not None and changed_pixels > 0:
        labelled, n_clusters = ndimage.label(mask > 0)
    else:
        n_clusters = 1 if changed_pixels > 0 else 0

    # Centroid of change
    if changed_pixels > 0:
        ys, xs = np.where(mask > 0)
        cy, cx = float(np.mean(ys)), float(np.mean(xs))
    else:
        cy, cx = h / 2, w / 2

    quadrant = _quadrant_name(cy, cx, h, w)

    return {
        "pct": pct,
        "n_clusters": n_clusters,
        "quadrant": quadrant,
        "cy": cy,
        "cx": cx,
    }


def render_description(stats: dict) -> str:
    """Render a natural language change description from mask statistics.

    Uses the template bank as specified in PRD §7.3.
    """
    pct = stats["pct"]
    n = stats["n_clusters"]
    quadrant = stats["quadrant"]

    if pct < 0.5:
        return random.choice(TEMPLATES_MINIMAL_CHANGE).format(pct=pct)

    # Build compound description with some randomness
    if random.random() < 0.4 and n > 0:
        # Use a compound template
        return random.choice(TEMPLATES_COMPOUND).format(pct=pct, n=n, quadrant=quadrant)

    # Build multi-sentence description
    parts = []
    parts.append(random.choice(TEMPLATES_OVERALL).format(pct=pct))

    if n > 1:
        parts.append(random.choice(TEMPLATES_CLUSTERS).format(n=n))

    parts.append(random.choice(TEMPLATES_LOCATION).format(quadrant=quadrant))

    # Add type description for substantial changes
    if pct > 2.0:
        parts.append(random.choice(TEMPLATES_TYPE))

    return " ".join(parts)


def build_synthetic_dataset(
    levir_root: str,
    output: str = "synth_change_descriptions.json",
    split: str = "train",
):
    """Generate change-description training data from LEVIR-CD binary masks.

    Expected LEVIR-CD layout:
      {levir_root}/
        {split}/
          A/       — before images
          B/       — after images
          label/   — binary change masks

    Args:
        levir_root: Root directory of LEVIR-CD dataset
        output: Output manifest path
        split: Which split to process ("train", "val", "test")
    """
    root = Path(levir_root)
    manifest = []

    # Find mask directory
    mask_dirs = [
        root / split / "label",
        root / "label" / split,
        root / split / "masks",
        root / "masks" / split,
    ]
    mask_dir = next((d for d in mask_dirs if d.exists()), None)

    # Find image directories
    a_dirs = [root / split / "A", root / "A" / split, root / split / "images_A"]
    b_dirs = [root / split / "B", root / "B" / split, root / split / "images_B"]
    a_dir = next((d for d in a_dirs if d.exists()), None)
    b_dir = next((d for d in b_dirs if d.exists()), None)

    if mask_dir is None:
        print(f"No mask directory found under {root / split}")
        return []

    if a_dir is None or b_dir is None:
        print(f"Image directories A/ or B/ not found under {root / split}")
        return []

    mask_files = sorted(mask_dir.glob("*.png")) + sorted(mask_dir.glob("*.tif"))
    print(f"Found {len(mask_files)} masks in {mask_dir}")

    for mask_file in mask_files:
        img_id = mask_file.stem

        # Find corresponding t1 and t2 images
        t1_path = _find_file(a_dir, img_id)
        t2_path = _find_file(b_dir, img_id)

        if t1_path is None or t2_path is None:
            continue

        # Load and analyse mask
        mask = np.array(Image.open(mask_file).convert("L"))
        mask = (mask > 127).astype(np.uint8)  # Binarise

        stats = analyse_mask(mask)
        description = render_description(stats)

        manifest.append({
            "image_1": str(t1_path),
            "image_2": str(t2_path),
            "mask_path": str(mask_file),
            "n_images": 2,
            "task": "change_describe",
            "answer": description,
            "fmt": {},
            "stats": stats,
            "split": split,
            "source": "levir-cd-synth",
        })

    print(f"Synthesised {len(manifest)} change descriptions from LEVIR-CD")

    with open(output, "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"Written to {output}")

    return manifest


def _find_file(directory: Path, stem: str) -> Optional[Path]:
    for ext in [".png", ".jpg", ".jpeg", ".tif", ".tiff"]:
        candidate = directory / f"{stem}{ext}"
        if candidate.exists():
            return candidate
    return None


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Synthesise change descriptions from LEVIR-CD")
    parser.add_argument("--levir-root", required=True, help="LEVIR-CD dataset root")
    parser.add_argument("--output", default="synth_change_descriptions.json")
    parser.add_argument("--split", default="train")
    args = parser.parse_args()

    build_synthetic_dataset(
        levir_root=args.levir_root,
        output=args.output,
        split=args.split,
    )
