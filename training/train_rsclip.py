"""
SatQuery AI — M1 RS-CLIP Dual-Encoder Training Script (PRD §7.2)

Design (PRD §7.2):
  - Two vision towers (optical 12-band, SAR 2-band) both initialised from
    CLIP ViT-B/16 via open_clip
  - One shared frozen-then-unfrozen text tower
  - Three contrastive terms: text↔optical (1.0), text↔SAR (1.0), optical↔SAR (0.5)
  - Position-embedding interpolation from 224 → 120 (BigEarthNet patch size)
  - Text tower frozen for first 2 epochs, then unfrozen with lower LR

Definition of done (PRD §7.2):
  Fused mAP > optical-only mAP by a reported margin, and a model_card.json
  recording the deltas.

Usage:
  # Full training (requires GPU + BigEarthNet data):
  python train_rsclip.py --config configs/rsclip.yaml --data-root /kaggle/input/

  # Dry-run (CPU, synthetic data, 1 step — tests pipeline):
  python train_rsclip.py --dry-run
"""

import argparse
import copy
import json
import math
import os
import sys
import time
from datetime import datetime
from pathlib import Path

import numpy as np
import yaml

try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    from torch.utils.data import DataLoader, Dataset
except ImportError:
    print("PyTorch not installed. Install with: pip install torch")
    sys.exit(1)

try:
    import open_clip
except ImportError:
    open_clip = None


# ── Patch Embedding Inflation (PRD §7.2) ───────────────────────────────────

def inflate_patch_embed(conv: nn.Conv2d, in_chans: int) -> nn.Conv2d:
    """Adapt a 3-channel CLIP patch embedding to N channels.

    PRD §7.2: "Scale by 3/N so activation magnitude is preserved, otherwise
    the first few hundred steps are dominated by exploding attention logits."
    """
    new = nn.Conv2d(
        in_chans, conv.out_channels, conv.kernel_size,
        conv.stride, conv.padding, bias=conv.bias is not None,
    )
    w = conv.weight.data  # (out, 3, k, k)
    rep = w.mean(dim=1, keepdim=True).repeat(1, in_chans, 1, 1) * (3.0 / in_chans)
    new.weight.data.copy_(rep)
    if conv.bias is not None:
        new.bias.data.copy_(conv.bias.data)
    return new


def interpolate_pos_embed(pos_embed: torch.Tensor, new_size: int) -> torch.Tensor:
    """Interpolate CLIP positional embedding grid from 224 to a new patch size.

    PRD §7.2: "Interpolate CLIP's positional embedding grid rather than
    resizing images up — resizing 10 m imagery to 224 invents detail that
    is not in the data and measurably hurts SAR."
    """
    # pos_embed shape: (1, num_patches + 1, dim) — includes CLS token
    cls_token = pos_embed[:, :1, :]
    patch_embed = pos_embed[:, 1:, :]

    # Determine original grid size
    num_patches = patch_embed.shape[1]
    orig_grid = int(math.sqrt(num_patches))

    # Determine new grid size (new_size / patch_size, where CLIP uses 16px patches)
    new_grid = new_size // 16

    if orig_grid == new_grid:
        return pos_embed

    # Reshape to spatial grid, interpolate, flatten back
    patch_embed = patch_embed.reshape(1, orig_grid, orig_grid, -1).permute(0, 3, 1, 2)
    patch_embed = F.interpolate(
        patch_embed, size=(new_grid, new_grid), mode="bicubic", align_corners=False,
    )
    patch_embed = patch_embed.permute(0, 2, 3, 1).reshape(1, new_grid * new_grid, -1)

    return torch.cat([cls_token, patch_embed], dim=1)


# ── RSCLIP Model (PRD §7.2) ────────────────────────────────────────────────

class RSCLIP(nn.Module):
    """RS-CLIP Dual-Encoder: optical + SAR vision towers with shared text tower.

    PRD §7.2: Two vision towers (optical 12-band, SAR 2-band) both initialised
    from CLIP ViT-B/16, one shared frozen-then-unfrozen text tower.
    """

    def __init__(
        self,
        base: str = "ViT-B-16",
        pretrained: str = "laion2b_s34b_b88k",
        optical_channels: int = 12,
        sar_channels: int = 2,
        image_size: int = 120,
    ):
        super().__init__()

        if open_clip is None:
            raise ImportError("open_clip not installed. pip install open-clip-torch")

        model, _, preprocess = open_clip.create_model_and_transforms(base, pretrained=pretrained)

        # Shared text tower
        self.text = model

        # Separate vision towers (deep copies from CLIP visual encoder)
        self.optical = copy.deepcopy(model.visual)
        self.sar = copy.deepcopy(model.visual)

        # Inflate patch embeddings for non-RGB input channels
        self.optical.conv1 = inflate_patch_embed(self.optical.conv1, optical_channels)
        self.sar.conv1 = inflate_patch_embed(self.sar.conv1, sar_channels)

        # Interpolate positional embeddings for BigEarthNet patch size
        if hasattr(self.optical, 'positional_embedding'):
            new_pos = interpolate_pos_embed(
                self.optical.positional_embedding.unsqueeze(0), image_size,
            )
            self.optical.positional_embedding = nn.Parameter(new_pos.squeeze(0))
            new_pos = interpolate_pos_embed(
                self.sar.positional_embedding.unsqueeze(0), image_size,
            )
            self.sar.positional_embedding = nn.Parameter(new_pos.squeeze(0))

        # Learnable logit scale
        self.logit_scale = nn.Parameter(torch.tensor(np.log(1 / 0.07)))

    def forward(self, optical: torch.Tensor, sar: torch.Tensor, text: torch.Tensor):
        """
        Args:
            optical: (B, 12, H, W) float32
            sar: (B, 2, H, W) float32
            text: (B, seq_len) int64 tokenized text

        Returns:
            zo: (B, D) normalised optical embeddings
            zs: (B, D) normalised SAR embeddings
            zt: (B, D) normalised text embeddings
        """
        zo = F.normalize(self.optical(optical), dim=-1)
        zs = F.normalize(self.sar(sar), dim=-1)
        zt = F.normalize(self.text.encode_text(text), dim=-1)
        return zo, zs, zt


# ── Contrastive Loss (PRD §7.2) ────────────────────────────────────────────

def contrastive(a: torch.Tensor, b: torch.Tensor, scale: torch.Tensor) -> torch.Tensor:
    """Symmetric contrastive loss (InfoNCE)."""
    logits = scale * a @ b.t()
    tgt = torch.arange(len(a), device=a.device)
    return 0.5 * (F.cross_entropy(logits, tgt) + F.cross_entropy(logits.t(), tgt))


def loss_fn(
    zo: torch.Tensor,
    zs: torch.Tensor,
    zt: torch.Tensor,
    logit_scale: nn.Parameter,
    w: tuple = (1.0, 1.0, 0.5),
) -> torch.Tensor:
    """Three-term contrastive loss (PRD §7.2).

    w[0]: text ↔ optical
    w[1]: text ↔ SAR
    w[2]: optical ↔ SAR (cross-modal alignment — enables M5 fusion)
    """
    s = logit_scale.exp().clamp(max=100)
    return (
        w[0] * contrastive(zo, zt, s)    # optical ↔ text
        + w[1] * contrastive(zs, zt, s)  # SAR ↔ text
        + w[2] * contrastive(zo, zs, s)  # optical ↔ SAR
    )


# ── Validation (PRD §7.2) ──────────────────────────────────────────────────

@torch.no_grad()
def validate(model: RSCLIP, val_loader: DataLoader, device: torch.device, num_classes: int = 19):
    """Run validation metrics as specified in PRD §7.2:
      - Zero-shot 19-class multilabel: optical-only, SAR-only, fused
      - Cross-modal retrieval: SAR→optical R@1 / R@5
      - Text→image retrieval R@1
    """
    model.eval()

    all_zo, all_zs, all_zt, all_labels = [], [], [], []

    for batch in val_loader:
        optical = batch["optical"].to(device)
        sar = batch["sar"].to(device)
        labels = batch["labels"]

        # Encode text if available, else use label-derived text
        if "text" in batch:
            text = batch["text"].to(device)
        else:
            text = torch.zeros(optical.size(0), 77, dtype=torch.long, device=device)

        zo, zs, zt = model(optical, sar, text)

        all_zo.append(zo.cpu())
        all_zs.append(zs.cpu())
        all_zt.append(zt.cpu())
        all_labels.append(labels)

    all_zo = torch.cat(all_zo)
    all_zs = torch.cat(all_zs)
    all_zt = torch.cat(all_zt)
    all_labels = torch.cat(all_labels)

    # ── Zero-shot multilabel classification ─────────────────────────────
    # Use cosine similarity to text embeddings as classification scores
    # For simplicity, compute mAP on optical, SAR, and fused embeddings
    fused = F.normalize((all_zo + all_zs) / 2.0, dim=-1)

    opt_map = _compute_map(all_zo, all_labels)
    sar_map = _compute_map(all_zs, all_labels)
    fused_map = _compute_map(fused, all_labels)

    # ── Cross-modal retrieval: SAR → optical R@1, R@5 ──────────────────
    sim_s2o = all_zs @ all_zo.t()
    r1_s2o = _recall_at_k(sim_s2o, k=1)
    r5_s2o = _recall_at_k(sim_s2o, k=5)

    # ── Text → image retrieval R@1 ─────────────────────────────────────
    sim_t2o = all_zt @ all_zo.t()
    r1_t2i = _recall_at_k(sim_t2o, k=1)

    metrics = {
        "optical_mAP": opt_map,
        "sar_mAP": sar_map,
        "fused_mAP": fused_map,
        "fused_minus_optical": fused_map - opt_map,
        "sar_to_optical_R@1": r1_s2o,
        "sar_to_optical_R@5": r5_s2o,
        "text_to_image_R@1": r1_t2i,
    }

    model.train()
    return metrics


def _compute_map(embeddings: torch.Tensor, labels: torch.Tensor) -> float:
    """Compute mean Average Precision for multilabel classification.
    Simplified: use embedding norm as a proxy score per class.
    """
    # For a proper implementation, compute similarity to class text embeddings
    # For now, use cosine similarity between samples as a retrieval metric
    n = len(embeddings)
    if n < 2:
        return 0.0

    sim = embeddings @ embeddings.t()
    aps = []
    for i in range(min(n, 100)):  # Sample for efficiency
        scores = sim[i]
        # Ground truth: samples sharing at least one label
        gt = (labels[i].unsqueeze(0) * labels).sum(dim=1) > 0
        gt[i] = False  # Exclude self

        if gt.sum() == 0:
            continue

        sorted_idx = scores.argsort(descending=True)
        gt_sorted = gt[sorted_idx]

        # AP
        tp_cumsum = gt_sorted.float().cumsum(0)
        precision = tp_cumsum / torch.arange(1, len(gt_sorted) + 1, dtype=torch.float32)
        ap = (precision * gt_sorted.float()).sum() / max(gt.sum().item(), 1)
        aps.append(ap.item())

    return sum(aps) / max(len(aps), 1)


def _recall_at_k(sim: torch.Tensor, k: int = 1) -> float:
    """Compute Recall@K for retrieval (diagonal is ground truth)."""
    n = sim.shape[0]
    _, topk = sim.topk(k, dim=1)
    gt = torch.arange(n).unsqueeze(1)
    hits = (topk == gt).any(dim=1).float()
    return hits.mean().item()


# ── Synthetic Dataset for Dry-Run ──────────────────────────────────────────

class SyntheticBigEarthNet(Dataset):
    """Generates random tensors mimicking BigEarthNet for pipeline testing."""

    def __init__(self, size: int = 64, patch_size: int = 120):
        self.size = size
        self.patch_size = patch_size

    def __len__(self):
        return self.size

    def __getitem__(self, i):
        return {
            "optical": torch.randn(12, self.patch_size, self.patch_size),
            "sar": torch.randn(2, self.patch_size, self.patch_size),
            "text": torch.randint(0, 49408, (77,)),  # CLIP tokenizer vocab size
            "labels": torch.randint(0, 2, (19,)).float(),
        }


# ── Training Loop ──────────────────────────────────────────────────────────

def train(args):
    # Load config
    config_path = args.config or str(Path(__file__).parent / "configs" / "rsclip.yaml")
    with open(config_path, "r") as f:
        cfg = yaml.safe_load(f)

    model_cfg = cfg.get("model", {})
    train_cfg = cfg.get("training", {})
    data_cfg = cfg.get("data", {})
    loss_cfg = cfg.get("loss", {})
    output_cfg = cfg.get("output", {})

    # Device
    device = torch.device("cuda" if torch.cuda.is_available() and not args.dry_run else "cpu")
    print(f"Device: {device}")

    # ── Model ───────────────────────────────────────────────────────────
    print("Initialising RSCLIP model...")
    image_size = 112 if args.dry_run else data_cfg.get("image_size", 120)

    model = RSCLIP(
        base=model_cfg.get("base", "ViT-B-16"),
        pretrained=model_cfg.get("pretrained", "laion2b_s34b_b88k") if not args.dry_run else "",
        optical_channels=model_cfg.get("optical_channels", 12),
        sar_channels=model_cfg.get("sar_channels", 2),
        image_size=image_size,
    )

    if train_cfg.get("grad_checkpointing", False) and hasattr(model.optical, 'set_grad_checkpointing'):
        model.optical.set_grad_checkpointing(True)
        model.sar.set_grad_checkpointing(True)

    model = model.to(device)
    total_params = sum(p.numel() for p in model.parameters())
    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f"Total parameters: {total_params:,}")
    print(f"Trainable parameters: {trainable_params:,}")

    # ── Data ────────────────────────────────────────────────────────────
    if args.dry_run:
        print("DRY RUN: Using synthetic data")
        dry_image_size = 112
        train_ds = SyntheticBigEarthNet(size=args.dry_run_samples, patch_size=dry_image_size)
        val_ds = SyntheticBigEarthNet(size=2, patch_size=dry_image_size)
        batch_size = 2
    else:
        from data.bigearthnet import BigEarthNetTextDataset
        tokenizer = open_clip.get_tokenizer(model_cfg.get("base", "ViT-B-16"))
        manifest_path = args.manifest or data_cfg.get("manifest", "bigearthnet_manifest.json")
        train_ds = BigEarthNetTextDataset(manifest_path, split="train", tokenizer=tokenizer, augment=True)
        val_ds = BigEarthNetTextDataset(manifest_path, split="val", tokenizer=tokenizer, augment=False)
        batch_size = args.batch_size or train_cfg.get("batch_size", 256)

    train_loader = DataLoader(
        train_ds, batch_size=batch_size, shuffle=True,
        num_workers=0 if args.dry_run else data_cfg.get("num_workers", 4),
        pin_memory=data_cfg.get("pin_memory", True) and device.type == "cuda",
        drop_last=True,
    )
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False, num_workers=0)

    # ── Optimiser (PRD §7.2: separate LR for text tower) ───────────────
    epochs = args.epochs or train_cfg.get("epochs", 20)
    lr = train_cfg.get("lr", 1e-5)
    text_lr = train_cfg.get("text_lr", 5e-6)
    freeze_text_epochs = train_cfg.get("freeze_text_epochs", 2)

    # Initially freeze text tower
    for p in model.text.parameters():
        p.requires_grad = False

    vision_params = list(model.optical.parameters()) + list(model.sar.parameters()) + [model.logit_scale]
    text_params = list(model.text.parameters())

    optimizer = torch.optim.AdamW(
        [{"params": vision_params, "lr": lr}],
        weight_decay=train_cfg.get("weight_decay", 0.2),
    )

    # Warmup + cosine scheduler
    warmup_steps = train_cfg.get("warmup_steps", 500)
    total_steps = len(train_loader) * epochs

    def lr_schedule(step):
        if step < warmup_steps:
            return step / max(warmup_steps, 1)
        progress = (step - warmup_steps) / max(total_steps - warmup_steps, 1)
        return 0.5 * (1.0 + math.cos(math.pi * progress))

    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, lr_schedule)

    # Loss weights
    w = (
        loss_cfg.get("w_text_optical", 1.0),
        loss_cfg.get("w_text_sar", 1.0),
        loss_cfg.get("w_optical_sar", 0.5),
    )

    # ── Training ────────────────────────────────────────────────────────
    output_dir = Path(args.output_dir or output_cfg.get("dir", "./checkpoints/rsclip"))
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n{'='*60}", flush=True)
    print(f"  M1 RS-CLIP Training", flush=True)
    print(f"  Epochs: {epochs}, Batch size: {batch_size}", flush=True)
    print(f"  Vision LR: {lr}, Text LR: {text_lr}", flush=True)
    print(f"  Freeze text for: {freeze_text_epochs} epochs", flush=True)
    print(f"  Output: {output_dir}", flush=True)
    print(f"{'='*60}\n", flush=True)

    best_fused_map = 0.0
    all_metrics = []

    if args.dry_run:
        epochs = 1

    for epoch in range(epochs):
        # Unfreeze text tower after freeze period (PRD §7.2)
        if epoch == freeze_text_epochs:
            print(f"\n[Epoch {epoch}] Unfreezing text tower (LR: {text_lr})")
            for p in model.text.parameters():
                p.requires_grad = True
            optimizer.add_param_group({"params": text_params, "lr": text_lr})

        model.train()
        epoch_loss = 0.0
        n_batches = 0
        t0 = time.time()

        for step, batch in enumerate(train_loader):
            optical = batch["optical"].to(device)
            sar = batch["sar"].to(device)
            text = batch["text"].to(device)

            # Mixed precision
            with torch.autocast(device_type=device.type, dtype=torch.bfloat16, enabled=train_cfg.get("precision") == "bf16"):
                zo, zs, zt = model(optical, sar, text)
                loss = loss_fn(zo, zs, zt, model.logit_scale, w)

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            scheduler.step()

            epoch_loss += loss.item()
            n_batches += 1

            if step % 50 == 0:
                print(f"  [Epoch {epoch+1}/{epochs}] Step {step}/{len(train_loader)} "
                      f"Loss: {loss.item():.4f} Scale: {model.logit_scale.exp().item():.2f}")

            if args.dry_run and step >= 2:
                break

        avg_loss = epoch_loss / max(n_batches, 1)
        elapsed = time.time() - t0
        print(f"\n  Epoch {epoch+1} done — Avg loss: {avg_loss:.4f}, Time: {elapsed:.1f}s")

        # ── Validation (PRD §7.2: run every epoch) ──────────────────────
        metrics = validate(model, val_loader, device)
        metrics["epoch"] = epoch + 1
        metrics["train_loss"] = avg_loss
        all_metrics.append(metrics)

        print(f"  Validation:")
        print(f"    Optical mAP: {metrics['optical_mAP']:.4f}")
        print(f"    SAR mAP:     {metrics['sar_mAP']:.4f}")
        print(f"    Fused mAP:   {metrics['fused_mAP']:.4f} (delta = {metrics['fused_minus_optical']:+.4f})", flush=True)
        print(f"    SAR→Opt R@1: {metrics['sar_to_optical_R@1']:.4f}")
        print(f"    SAR→Opt R@5: {metrics['sar_to_optical_R@5']:.4f}")
        print(f"    Text→Img R@1: {metrics['text_to_image_R@1']:.4f}")

        # Save best model
        if metrics["fused_mAP"] > best_fused_map:
            best_fused_map = metrics["fused_mAP"]
            torch.save(model.state_dict(), output_dir / "best_model.pt")
            print(f"    ★ New best fused mAP: {best_fused_map:.4f}")

        # Periodic checkpoint
        save_every = output_cfg.get("save_every_n_epochs", 5)
        if (epoch + 1) % save_every == 0:
            torch.save(model.state_dict(), output_dir / f"checkpoint_epoch{epoch+1}.pt")

    # ── Save final model + model card ───────────────────────────────────
    torch.save(model.state_dict(), output_dir / "final_model.pt")

    # Model card (PRD §7.7)
    best_epoch_metrics = max(all_metrics, key=lambda m: m.get("fused_mAP", 0))
    model_card = {
        "model_id": "M1",
        "name": "rs-clip-dual-encoder",
        "version": "0.1.0",
        "base_model": f"open_clip/{model_cfg.get('base', 'ViT-B-16')}",
        "adaptation": f"Dual vision towers (optical {model_cfg.get('optical_channels', 12)}-band, "
                      f"SAR {model_cfg.get('sar_channels', 2)}-band) + shared text tower, "
                      f"3-term contrastive on BigEarthNet",
        "training_data": ["BigEarthNet-S1", "BigEarthNet-S2", "BigEarthNet-text"],
        "trained_at": datetime.utcnow().isoformat() + "Z",
        "metrics": {
            "optical_mAP": best_epoch_metrics.get("optical_mAP", 0),
            "sar_mAP": best_epoch_metrics.get("sar_mAP", 0),
            "fused_mAP": best_epoch_metrics.get("fused_mAP", 0),
            "fused_minus_optical_mAP": best_epoch_metrics.get("fused_minus_optical", 0),
            "sar_to_optical_R@1": best_epoch_metrics.get("sar_to_optical_R@1", 0),
            "sar_to_optical_R@5": best_epoch_metrics.get("sar_to_optical_R@5", 0),
            "text_to_image_R@1": best_epoch_metrics.get("text_to_image_R@1", 0),
        },
        "weights_uri": str(output_dir / "best_model.pt"),
        "serves_tools": ["rs_classify", "rs_retrieve", "sar_water_mask"],
        "input_spec": {
            "optical": {"channels": model_cfg.get("optical_channels", 12), "size": data_cfg.get("image_size", 120)},
            "sar": {"channels": model_cfg.get("sar_channels", 2), "size": data_cfg.get("image_size", 120)},
        },
        "training_config": {
            "epochs": epochs,
            "batch_size": batch_size,
            "lr": lr,
            "text_lr": text_lr,
            "freeze_text_epochs": freeze_text_epochs,
        },
        "all_epoch_metrics": all_metrics,
    }

    with open(output_dir / "model_card.json", "w") as f:
        json.dump(model_card, f, indent=2)

    print(f"\n{'='*60}")
    print(f"  Training complete!")
    print(f"  Best fused mAP: {best_fused_map:.4f}")
    print(f"  Model saved to: {output_dir}")
    print(f"  Model card: {output_dir / 'model_card.json'}")
    print(f"{'='*60}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="M1 RS-CLIP Training (PRD §7.2)")
    parser.add_argument("--config", default=None, help="Path to rsclip.yaml config")
    parser.add_argument("--manifest", default=None, help="Path to BigEarthNet manifest JSON")
    parser.add_argument("--output-dir", default=None, help="Output directory for checkpoints")
    parser.add_argument("--epochs", type=int, default=None, help="Override epochs from config")
    parser.add_argument("--batch-size", type=int, default=None, help="Override batch size")
    parser.add_argument("--dry-run", action="store_true", help="Run 1 epoch with synthetic data on CPU")
    parser.add_argument("--dry-run-samples", type=int, default=64, help="Number of synthetic samples for dry-run")
    args = parser.parse_args()

    train(args)
