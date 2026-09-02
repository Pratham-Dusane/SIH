"""
Enhancement models — Extensions PRD §4.4.
"""
from typing import Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class EnhancementConfig(BaseModel):
    method: Literal["none", "radiometric", "pansharpen", "sr_x2", "sr_x4", "speckle"] = "radiometric"
    clahe_clip: float = Field(2.0, ge=0.5, le=8.0)
    pansharpen_algo: Literal["brovey", "gram_schmidt"] = "brovey"
    speckle_method: Literal["refined_lee", "nlm"] = "nlm"
    tile_px: int = 256
    overlap_px: int = 32
    sr_weights: str = ""
    min_ssim: float = 0.70
    min_sharpness_gain: float = 1.05


class EnhancementRecord(BaseModel):
    method: str
    params: Dict = Field(default_factory=dict)
    scale: float = 1.0
    effective_gsd_m: Optional[float] = None
    is_synthetic_resolution: bool = False
    quality: Dict = Field(default_factory=dict)
    accepted: bool = True
    rejection_reason: Optional[str] = None
    artifact_path: Optional[str] = None
    duration_ms: int = 0
    cache_hit: bool = False
