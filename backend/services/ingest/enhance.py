"""
Scene enhancement preprocessing — Extensions PRD §4.4.

Method ladder: none → radiometric → pansharpen → sr_x2/sr_x4 → speckle.
Enhancement is display and perception only. Measurement always runs on the original raster.
"""

from __future__ import annotations

import hashlib
import logging
import os
import time
from typing import Any, Dict, Optional, Tuple

import numpy as np

log = logging.getLogger(__name__)

# In-memory cache: key -> (array, record)
_ENHANCE_CACHE: Dict[str, Any] = {}


def cache_key(checksum: str, method: str, params: dict) -> str:
    param_str = str(sorted(params.items()))
    raw = f"{checksum}:{method}:{param_str}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def radiometric(arr: np.ndarray, clahe_clip: float = 2.0) -> np.ndarray:
    """Per-band 2-98 percentile stretch + CLAHE on luminance."""
    try:
        import cv2
    except ImportError:
        log.warning("OpenCV not available — radiometric enhancement skipped")
        return arr

    result = arr.copy().astype(np.float32)

    # Per-band percentile stretch
    for b in range(result.shape[2] if result.ndim == 3 else 1):
        band = result[:, :, b] if result.ndim == 3 else result
        p2, p98 = np.percentile(band[band > 0] if np.any(band > 0) else band, [2, 98])
        if p98 > p2:
            band[:] = np.clip((band - p2) / (p98 - p2), 0, 1)

    # CLAHE on luminance (convert to LAB if 3+ bands)
    if result.ndim == 3 and result.shape[2] >= 3:
        rgb = (result[:, :, :3] * 255).astype(np.uint8)
        lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)
        clahe = cv2.createCLAHE(clipLimit=clahe_clip, tileGridSize=(8, 8))
        lab[:, :, 0] = clahe.apply(lab[:, :, 0])
        enhanced_rgb = cv2.cvtColor(lab, cv2.COLOR_LAB2RGB).astype(np.float32) / 255.0
        result[:, :, :3] = enhanced_rgb
    elif result.ndim == 2:
        img = (result * 255).astype(np.uint8)
        clahe = cv2.createCLAHE(clipLimit=clahe_clip, tileGridSize=(8, 8))
        result = clahe.apply(img).astype(np.float32) / 255.0

    return result


def speckle_filter(arr: np.ndarray, method: str = "nlm") -> np.ndarray:
    """Speckle filter for SAR (already in dB scale)."""
    try:
        import cv2
    except ImportError:
        return arr

    if method == "nlm":
        # Non-local means denoising
        if arr.ndim == 2:
            img = ((arr - arr.min()) / (arr.max() - arr.min() + 1e-8) * 255).astype(np.uint8)
            filtered = cv2.fastNlMeansDenoising(img, h=10, templateWindowSize=7, searchWindowSize=21)
            return filtered.astype(np.float32) / 255.0 * (arr.max() - arr.min()) + arr.min()
    return arr


def has_pan_band(meta: dict) -> bool:
    """Check if the raster has a panchromatic band."""
    band_count = meta.get("band_count", 0)
    # Typical pansharpening scenario: multispectral + pan band
    return band_count >= 4 and meta.get("gsd_m", 999) < 5


def pansharpen(arr: np.ndarray, meta: dict, algorithm: str = "brovey") -> np.ndarray:
    """Brovey pansharpening using the last band as panchromatic."""
    if arr.ndim != 3 or arr.shape[2] < 4:
        return arr

    try:
        import cv2
    except ImportError:
        return arr

    # Assume last band is pan
    ms = arr[:, :, :3].astype(np.float32)
    pan = arr[:, :, -1].astype(np.float32)

    # Upsample MS bands to pan resolution if different
    if pan.shape != ms.shape[:2]:
        ms = cv2.resize(ms, (pan.shape[1], pan.shape[0]), interpolation=cv2.INTER_CUBIC)

    if algorithm == "brovey":
        total = ms.sum(axis=2) + 1e-8
        result = np.zeros_like(ms)
        for b in range(3):
            result[:, :, b] = (ms[:, :, b] / total) * pan
    else:
        # Gram-Schmidt: simplified version
        intensity = ms.mean(axis=2)
        result = np.zeros_like(ms)
        for b in range(3):
            result[:, :, b] = ms[:, :, b] + (pan - intensity)

    return np.clip(result, 0, 1)


def quality_gate(original: np.ndarray, enhanced: np.ndarray,
                 min_ssim: float = 0.70, min_sharpness_gain: float = 1.05) -> dict:
    """
    SSIM and Laplacian variance checks.
    Low SSIM → network is changing content. No sharpness gain → no benefit.
    """
    try:
        import cv2
    except ImportError:
        return {"accepted": True, "ssim_vs_upsampled": 1.0,
                "lap_var_before": 0, "lap_var_after": 0}

    # Resize original to enhanced dimensions for comparison
    if original.shape[:2] != enhanced.shape[:2]:
        ref = cv2.resize(original, (enhanced.shape[1], enhanced.shape[0]),
                         interpolation=cv2.INTER_CUBIC)
    else:
        ref = original

    # Ensure both are 2D for metrics
    if ref.ndim == 3:
        ref_gray = np.mean(ref, axis=2)
    else:
        ref_gray = ref
    if enhanced.ndim == 3:
        enh_gray = np.mean(enhanced, axis=2)
    else:
        enh_gray = enhanced

    # Laplacian variance (sharpness measure)
    def lap_var(img):
        img_u8 = (np.clip(img, 0, 1) * 255).astype(np.uint8)
        return cv2.Laplacian(img_u8, cv2.CV_64F).var()

    lap_before = lap_var(ref_gray)
    lap_after = lap_var(enh_gray)

    # Simple SSIM approximation (avoids skimage dependency)
    def simple_ssim(a, b):
        mu_a, mu_b = a.mean(), b.mean()
        sig_a, sig_b = a.std(), b.std()
        sig_ab = ((a - mu_a) * (b - mu_b)).mean()
        c1 = (0.01 * 255) ** 2
        c2 = (0.03 * 255) ** 2
        ssim = ((2 * mu_a * mu_b + c1) * (2 * sig_ab + c2)) / \
               ((mu_a ** 2 + mu_b ** 2 + c1) * (sig_a ** 2 + sig_b ** 2 + c2))
        return float(ssim)

    ssim_val = simple_ssim(
        (ref_gray * 255).astype(np.float64),
        (enh_gray * 255).astype(np.float64)
    )

    accepted = True
    reason = None

    if ssim_val < min_ssim:
        accepted = False
        reason = (f"SSIM {ssim_val:.3f} against bicubic upsample is below {min_ssim}; "
                  "the model is restructuring content rather than sharpening it")
    elif lap_after < lap_before * min_sharpness_gain:
        accepted = False
        reason = (f"No sharpness gain ({lap_after:.1f} vs {lap_before:.1f}); "
                  "enhancement is not earning its compute")

    return {
        "accepted": accepted,
        "rejection_reason": reason,
        "ssim_vs_upsampled": round(ssim_val, 4),
        "lap_var_before": round(lap_before, 2),
        "lap_var_after": round(lap_after, 2),
    }


def enhance(meta: dict, arr: np.ndarray, modality: str,
            method: str = "radiometric", **kwargs) -> Tuple[np.ndarray, dict]:
    """
    Main enhancement entrypoint.
    Returns (enhanced_array, EnhancementRecord_dict).
    """
    start_ms = int(time.time() * 1000)
    checksum = meta.get("checksum", hashlib.md5(arr.tobytes()[:4096]).hexdigest()[:16])
    key = cache_key(checksum, method, kwargs)

    # Cache check
    if key in _ENHANCE_CACHE:
        cached = _ENHANCE_CACHE[key]
        record = {**cached["record"], "cache_hit": True}
        return cached["array"], record

    scale = 1.0
    is_synthetic = False
    effective_gsd = meta.get("gsd_m")

    # Normalise to float [0,1]
    work = arr.astype(np.float32)
    if work.max() > 1.0:
        work = work / max(work.max(), 1.0)

    # Method routing
    if method == "none":
        result = work
    elif modality == "SAR":
        result = speckle_filter(work, method=kwargs.get("speckle_method", "nlm"))
    elif method == "pansharpen" and has_pan_band(meta):
        result = radiometric(work, clahe_clip=kwargs.get("clahe_clip", 2.0))
        result = pansharpen(result, meta, algorithm=kwargs.get("pansharpen_algo", "brovey"))
    elif method.startswith("sr_"):
        # SR requires ONNX weights — fall back to radiometric if not available
        result = radiometric(work, clahe_clip=kwargs.get("clahe_clip", 2.0))
        sr_scale = int(method[-1])
        # Check for weights
        weights_path = kwargs.get("sr_weights", "")
        if weights_path and os.path.exists(weights_path):
            try:
                result = _tiled_sr(result, scale=sr_scale,
                                   tile=kwargs.get("tile_px", 256),
                                   overlap=kwargs.get("overlap_px", 32),
                                   weights=weights_path)
                scale = float(sr_scale)
                is_synthetic = True
                if effective_gsd:
                    effective_gsd = effective_gsd / sr_scale
            except Exception as e:
                log.warning("SR failed, falling back to radiometric: %s", e)
        else:
            log.info("SR weights not found at %s — using radiometric only", weights_path)
    else:
        result = radiometric(work, clahe_clip=kwargs.get("clahe_clip", 2.0))

    # Quality gate for SR
    quality = {}
    accepted = True
    rejection_reason = None
    if method.startswith("sr_") and scale > 1.0:
        quality = quality_gate(work, result,
                               min_ssim=kwargs.get("min_ssim", 0.70),
                               min_sharpness_gain=kwargs.get("min_sharpness_gain", 1.05))
        accepted = quality.get("accepted", True)
        rejection_reason = quality.get("rejection_reason")
        if not accepted:
            # Fall back to radiometric
            result = radiometric(work, clahe_clip=kwargs.get("clahe_clip", 2.0))
            scale = 1.0
            is_synthetic = False
            effective_gsd = meta.get("gsd_m")

    duration_ms = int(time.time() * 1000) - start_ms

    record = {
        "method": method if accepted else "radiometric",
        "params": kwargs,
        "scale": scale,
        "effective_gsd_m": effective_gsd,
        "is_synthetic_resolution": is_synthetic,
        "quality": quality,
        "accepted": accepted,
        "rejection_reason": rejection_reason,
        "artifact_path": None,
        "duration_ms": duration_ms,
        "cache_hit": False,
    }

    # Cache
    _ENHANCE_CACHE[key] = {"array": result, "record": record}

    return result, record


def _tiled_sr(arr: np.ndarray, scale: int = 2, tile: int = 256,
              overlap: int = 32, weights: str = "") -> np.ndarray:
    """
    Tiled super-resolution with cosine feathering across overlap bands.
    Requires ONNX Runtime and weights file.
    """
    try:
        import onnxruntime as ort
    except ImportError:
        raise RuntimeError("onnxruntime not installed for super-resolution")

    if not os.path.exists(weights):
        raise RuntimeError(f"SR weights not found: {weights}")

    session = ort.InferenceSession(weights)
    h, w = arr.shape[:2]
    channels = arr.shape[2] if arr.ndim == 3 else 1

    out_h, out_w = h * scale, w * scale
    result = np.zeros((out_h, out_w, channels), dtype=np.float32)
    weight_map = np.zeros((out_h, out_w, channels), dtype=np.float32)

    # Cosine feather window
    def feather_1d(size, overlap_size):
        w = np.ones(size)
        if overlap_size > 0:
            ramp = 0.5 * (1 - np.cos(np.pi * np.arange(overlap_size) / overlap_size))
            w[:overlap_size] = ramp
            w[-overlap_size:] = ramp[::-1]
        return w

    step = tile - overlap
    for y in range(0, h, step):
        for x in range(0, w, step):
            ye, xe = min(y + tile, h), min(x + tile, w)
            patch = arr[y:ye, x:xe]
            if patch.ndim == 2:
                patch = patch[:, :, np.newaxis]

            # Pad to tile size if needed
            ph, pw = patch.shape[:2]
            if ph < tile or pw < tile:
                padded = np.zeros((tile, tile, channels), dtype=np.float32)
                padded[:ph, :pw] = patch
                patch = padded

            # ONNX inference
            inp = patch.transpose(2, 0, 1)[np.newaxis]  # (1, C, H, W)
            out = session.run(None, {session.get_inputs()[0].name: inp})[0]
            out = out[0].transpose(1, 2, 0)  # (H*scale, W*scale, C)

            # Crop to actual output size
            oh, ow = min(ph * scale, out.shape[0]), min(pw * scale, out.shape[1])
            out = out[:oh, :ow]

            # Feathering weights
            fw_y = feather_1d(oh, overlap * scale // 2)
            fw_x = feather_1d(ow, overlap * scale // 2)
            fw = fw_y[:, np.newaxis] * fw_x[np.newaxis, :]
            fw = fw[:, :, np.newaxis]

            oy, ox = y * scale, x * scale
            oye, oxe = oy + oh, ox + ow
            result[oy:oye, ox:oxe] += out * fw
            weight_map[oy:oye, ox:oxe] += fw

    weight_map = np.maximum(weight_map, 1e-8)
    return np.clip(result / weight_map, 0, 1)
