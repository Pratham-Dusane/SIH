"""
SAR amplitude -> decibel conversion, shared by every SAR-consuming tool.

Why this is not a one-liner:

A calibrated Sentinel-1 product carries backscatter coefficients (sigma0 /
gamma0) as linear power around 0-1, which lands roughly in -35..+10 dB.  Many
real products — RISAT scenes, GeoTIFF subsets cut by a portal, anything
exported without applying the calibration LUT — instead carry raw digital
numbers.  A uint16 DN scene of 54..5891 converts to +17..+38 dB.

Clipping that to a fixed calibrated envelope collapses the whole raster to a
single value, and every threshold comparison afterwards silently returns False:
no water, no built-up, 100% "sensor conflict", from imagery that was perfectly
usable.  That is the failure this module exists to prevent.

Otsu and percentile thresholds are both *relative* to the distribution, so they
work fine on uncalibrated DN.  What is not safe is presenting the resulting dB
numbers as absolute backscatter — so the caller is told which case it got and
must say so in its output.
"""

from __future__ import annotations

from typing import Tuple

import numpy as np

# Envelope a genuinely calibrated backscatter product falls inside.
CALIBRATED_DB_MIN = -40.0
CALIBRATED_DB_MAX = 12.0

# Clip applied to calibrated data — trims the extreme tails without flattening.
CLIP_DB_MIN = -35.0
CLIP_DB_MAX = 10.0


def to_db(arr: np.ndarray) -> Tuple[np.ndarray, bool]:
    """
    Convert SAR amplitude/intensity to dB.

    Returns `(db, calibrated)`.  When `calibrated` is False the values are
    relative — correct for thresholding, but not absolute backscatter, and the
    caller must label them accordingly.
    """
    data = np.asarray(arr, dtype="float64")
    db = 10.0 * np.log10(np.clip(data, 1e-10, None))

    finite = db[np.isfinite(db)]
    if finite.size == 0:
        return np.zeros_like(db), False

    lo, hi = np.percentile(finite, [1.0, 99.0])
    calibrated = bool(lo >= CALIBRATED_DB_MIN and hi <= CALIBRATED_DB_MAX)

    if calibrated:
        return np.clip(db, CLIP_DB_MIN, CLIP_DB_MAX), True

    # Uncalibrated DN: clip to the data's own 1-99 percentile so speckle
    # outliers do not dominate a threshold, while keeping the distribution
    # intact.  A degenerate (single-valued) raster is returned unclipped so the
    # caller can detect it rather than receive a silently flattened array.
    if hi <= lo:
        return db, False
    return np.clip(db, lo, hi), False


def uncalibrated_warning(tool_name: str) -> str:
    return (
        f"{tool_name}: the SAR raster is not calibrated backscatter (values are raw "
        "digital numbers), so dB figures are relative to this scene, not absolute "
        "sigma0. Thresholds are computed from the scene's own distribution and "
        "remain valid; the dB numbers must not be compared across scenes."
    )


def is_degenerate(db: np.ndarray) -> bool:
    """True when the raster carries no usable contrast to threshold on."""
    finite = db[np.isfinite(db)]
    if finite.size == 0:
        return True
    return bool(np.ptp(finite) < 1e-6)
