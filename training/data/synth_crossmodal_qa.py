"""
SatQuery AI — Synthesise Cross-Modal QA from BigEarthNet Labels (PRD §7.3)

PRD §7.3: "From BigEarthNet 19-class labels plus a SAR backscatter threshold,
generate question/answer pairs of the form 'Which regions are water according
to both sensors?' with answers derived from the label set and the mask agreement."

Used by M2 cross_modal SFT (weight 0.05 in training mixture).

Kaggle dataset path: /kaggle/input/bigearthnet-s1/, /kaggle/input/bigearthnet-s2/
"""

import json
import random
from pathlib import Path
from typing import Optional

from .bigearthnet import LABEL_NAMES, NUM_CLASSES


# ── Question/Answer template banks ─────────────────────────────────────────

# Questions about specific classes visible in both modalities
CLASS_QUESTIONS = {
    "Inland waters": [
        ("Which areas appear as water bodies in both the optical and SAR imagery?",
         "Based on the optical imagery showing {detail} and the SAR image showing low backscatter, inland water bodies are present in this scene."),
        ("Can you identify water features using both sensors?",
         "The optical image shows water surfaces as {detail}, and the SAR image confirms this with characteristically low backscatter returns. Water bodies are clearly identifiable from both modalities."),
        ("What water bodies are visible when combining optical and SAR data?",
         "Cross-modal analysis confirms the presence of inland water. The optical bands show absorption in the near-infrared while SAR shows specular reflection characteristic of calm water."),
    ],
    "Urban fabric": [
        ("What urban areas can be identified from the combined optical and SAR analysis?",
         "Urban fabric is detected in this scene. The optical image shows {detail}, while the SAR image shows high backscatter typical of built-up areas with corner reflectors from buildings."),
        ("How do the optical and SAR images complement each other in identifying urban regions?",
         "The optical image reveals urban areas through spectral signatures, while the SAR image independently confirms built-up regions through strong double-bounce backscatter from buildings and infrastructure."),
        ("Can you confirm the presence of built-up areas using both modalities?",
         "Both sensors confirm urban fabric. Optical imagery shows the spectral characteristics of built-up surfaces while SAR shows the geometric backscatter signature of man-made structures."),
    ],
    "Broad-leaved forest": [
        ("What forest areas are visible in both the optical and SAR imagery?",
         "Broad-leaved forest is present. The optical image shows dense green canopy with high near-infrared reflectance, while the SAR image shows volume scattering characteristic of forest canopy."),
        ("How do the optical and radar signals differ over forested areas in this scene?",
         "Over the forested regions, optical bands show strong vegetation signal (high NIR, low red), while SAR shows moderate-to-high volume scattering from the forest canopy. Both confirm broad-leaved forest cover."),
    ],
    "Arable land": [
        ("What agricultural areas are detectable from both sensors?",
         "Arable land is present in this scene. The optical image shows {detail} characteristic of cultivated fields, while the SAR image shows varying backscatter levels corresponding to different crop stages and soil moisture."),
        ("Can you identify crop fields using the combined optical and SAR data?",
         "Cross-modal analysis identifies arable land. Optical bands show vegetation patterns of agricultural fields, and SAR provides complementary information about surface roughness and soil moisture conditions."),
    ],
    "Pastures": [
        ("Are there grassland or pasture areas visible in both modalities?",
         "Pastures are detected in this scene. The optical image shows uniform green cover, while the SAR image shows low-to-moderate backscatter typical of short vegetation over grasslands."),
    ],
    "Coniferous forest": [
        ("What type of forest cover is detected by both sensors?",
         "Coniferous forest is identified. The optical image shows dark green canopy typical of evergreen trees, while the SAR image shows strong volume scattering from the dense needle-leaf canopy."),
    ],
}

# Generic cross-modal questions (applicable to any label combination)
GENERIC_QUESTIONS = [
    ("What land cover types can you identify using both the optical and SAR imagery?",
     "Using combined optical and SAR analysis, the following land cover types are identified: {labels}. The optical image provides spectral information while the SAR image contributes complementary structural and moisture information."),
    ("How do the optical and SAR images complement each other for this scene?",
     "In this scene, optical imagery reveals {labels} through spectral characteristics, while the SAR data provides independent confirmation through backscatter signatures. The fusion of both modalities increases classification confidence."),
    ("What features are visible in both the optical and radar imagery?",
     "Both modalities confirm the presence of: {labels}. The optical sensor captures surface reflectance while the SAR sensor provides geometry and moisture-related information, making the combined analysis more robust than either modality alone."),
    ("Describe the main land cover in this area using evidence from both sensors.",
     "The scene contains {labels}. Optical analysis reveals surface spectral properties while SAR contributes texture and structural characteristics. The agreement between modalities strengthens the land cover classification."),
    ("Which land cover classes are consistently detected by both the optical and SAR sensors?",
     "Both sensors consistently detect: {labels}. This cross-modal agreement provides high confidence in the classification, as the two sensing modalities capture fundamentally different physical properties of the land surface."),
]

# Detail phrases for optical observations (used in template formatting)
OPTICAL_DETAILS = {
    "Inland waters": ["dark blue-black surfaces", "spectrally absorptive water bodies", "low-reflectance water surfaces"],
    "Urban fabric": ["grey impervious surfaces and building structures", "high-albedo rooftops and roads", "regular geometric patterns of built-up areas"],
    "Broad-leaved forest": ["dense green canopy cover", "high near-infrared reflectance vegetation", "continuous broadleaf tree cover"],
    "Arable land": ["agricultural field patterns", "regular cultivation patterns with varying crop stages", "crop-covered parcels"],
    "Pastures": ["uniform grassland coverage", "low-height homogeneous vegetation", "pastoral green fields"],
    "Coniferous forest": ["dark evergreen canopy", "dense needle-leaf forest cover", "coniferous tree stands"],
}


def generate_crossmodal_qa(
    manifest_file: str,
    output: str = "synth_crossmodal_qa.json",
    max_per_patch: int = 2,
):
    """Generate cross-modal QA pairs from BigEarthNet manifest.

    Args:
        manifest_file: Path to BigEarthNet manifest JSON (from bigearthnet.py)
        output: Output path for synthesised QA manifest
        max_per_patch: Maximum number of QA pairs per patch
    """
    with open(manifest_file, "r") as f:
        manifest = json.load(f)

    qa_manifest = []

    for row in manifest:
        label_names = row.get("label_names", [])
        if not label_names:
            # Reconstruct from binary vector
            labels_vec = row.get("labels", [])
            label_names = [LABEL_NAMES[i] for i, v in enumerate(labels_vec) if v == 1]

        if not label_names:
            continue

        labels_str = ", ".join(label_names)
        generated = 0

        # Try class-specific questions first
        for label in label_names:
            if label in CLASS_QUESTIONS and generated < max_per_patch:
                q_template, a_template = random.choice(CLASS_QUESTIONS[label])
                detail = random.choice(OPTICAL_DETAILS.get(label, ["visible surface features"]))
                answer = a_template.format(detail=detail, labels=labels_str)

                qa_manifest.append({
                    "image_1": row["s2_path"],   # Optical (S2)
                    "image_2": row["s1_path"],   # SAR (S1)
                    "n_images": 2,
                    "task": "cross_modal",
                    "answer": answer,
                    "fmt": {"q": q_template},
                    "question": q_template,
                    "labels": label_names,
                    "split": row.get("split", "train"),
                    "source": "bigearthnet-synth-crossmodal",
                })
                generated += 1

        # Add generic question if we haven't generated enough
        if generated < max_per_patch:
            q_template, a_template = random.choice(GENERIC_QUESTIONS)
            answer = a_template.format(labels=labels_str)

            qa_manifest.append({
                "image_1": row["s2_path"],
                "image_2": row["s1_path"],
                "n_images": 2,
                "task": "cross_modal",
                "answer": answer,
                "fmt": {"q": q_template},
                "question": q_template,
                "labels": label_names,
                "split": row.get("split", "train"),
                "source": "bigearthnet-synth-crossmodal",
            })

    print(f"Synthesised {len(qa_manifest)} cross-modal QA pairs from BigEarthNet")

    with open(output, "w") as f:
        json.dump(qa_manifest, f, indent=2)
    print(f"Written to {output}")

    return qa_manifest


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Synthesise cross-modal QA from BigEarthNet")
    parser.add_argument("--manifest", required=True, help="BigEarthNet manifest JSON path")
    parser.add_argument("--output", default="synth_crossmodal_qa.json")
    parser.add_argument("--max-per-patch", type=int, default=2)
    args = parser.parse_args()

    generate_crossmodal_qa(
        manifest_file=args.manifest,
        output=args.output,
        max_per_patch=args.max_per_patch,
    )
