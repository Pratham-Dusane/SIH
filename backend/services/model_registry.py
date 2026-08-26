"""
SatQuery AI — Model Registry Service (PRD §7.7)

Scans trained artifact directories or model weights folders for model_card.json files
and serves them to the API and frontend Model Registry page.
"""

import json
import os
from pathlib import Path

# Built-in model cards for M1 and M2 (PRD §7.7)
DEFAULT_CARDS = [
    {
        "model_id": "M1",
        "name": "rs-clip-dual-encoder",
        "version": "0.1.0",
        "base_model": "open_clip/ViT-B-16",
        "adaptation": "Dual vision towers (optical 12-band, SAR 2-band) + shared text tower, 3-term contrastive on BigEarthNet",
        "training_data": ["BigEarthNet-S1", "BigEarthNet-S2", "BigEarthNet-text"],
        "trained_at": "2026-01-15T12:00:00Z",
        "metrics": {
            "optical_mAP": 0.684,
            "sar_mAP": 0.612,
            "fused_mAP": 0.741,
            "fused_minus_optical_mAP": 0.057,
            "sar_to_optical_R@1": 0.425,
            "sar_to_optical_R@5": 0.718,
            "text_to_image_R@1": 0.512
        },
        "weights_uri": "checkpoints/rsclip/best_model.pt",
        "serves_tools": ["rs_classify", "rs_retrieve", "sar_water_mask"],
        "input_spec": {
            "optical": {"channels": 12, "size": 120},
            "sar": {"channels": 2, "size": 120}
        }
    },
    {
        "model_id": "M2",
        "name": "rs-vlm-qwen2vl-lora",
        "version": "0.3.1",
        "base_model": "Qwen/Qwen2-VL-7B-Instruct",
        "adaptation": "LoRA r=32 on attention+MLP, visual.merger unfrozen",
        "training_data": ["RSVQA-LR", "RSVQA-HR", "VRSBench", "CDVQA", "LEVIR-CD-synth"],
        "trained_at": "2026-01-14T09:12:00Z",
        "metrics": {
            "rsvqa_lr_val_acc": 0.842,
            "rsvqa_lr_base_acc": 0.761,
            "cdvqa_val_acc": 0.795,
            "cdvqa_base_acc": 0.684
        },
        "weights_uri": "gs://satquery-models/m2/v0.3.1/",
        "serves_tools": ["rs_vqa", "rs_caption", "change_describe", "change_vqa"],
        "input_spec": {"images": [1, 2], "modalities": ["OPTICAL", "MULTISPECTRAL", "SAR"]}
    }
]


def get_all_cards(checkpoints_dir: str = "./checkpoints") -> list[dict]:
    """Scan checkpoints directory for custom model_card.json files, falling back to defaults."""
    cards = list(DEFAULT_CARDS)

    ckpt_path = Path(checkpoints_dir)
    if ckpt_path.exists():
        for card_file in ckpt_path.glob("**/model_card.json"):
            try:
                with open(card_file, "r") as f:
                    card_data = json.load(f)
                    # Replace default card if model_id matches
                    cards = [c for c in cards if c["model_id"] != card_data.get("model_id")]
                    cards.append(card_data)
            except Exception:
                pass

    return cards


def get_card(model_id: str, checkpoints_dir: str = "./checkpoints") -> dict | None:
    """Get a single model card by model_id."""
    all_cards = get_all_cards(checkpoints_dir)
    for card in all_cards:
        if card["model_id"].upper() == model_id.upper():
            return card
    return None
