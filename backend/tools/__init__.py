"""
Tools package - auto-imports all tool modules to trigger @register decorators.
"""

# Import all tool modules so the @register decorators run at import time.
# This populates tools.registry.REGISTRY with all available tools.

# Deterministic, offline-capable tools (PRD §8.3.8)
from tools import spectral_index  # noqa: F401
from tools import sar_water_mask  # noqa: F401
from tools import geo_stats       # noqa: F401
from tools import coreg_check     # noqa: F401

# Hosted VLM backend V1 (PRD §7.1) - online only, offline_capable=False
from tools import rs_vqa          # noqa: F401
from tools import rs_caption      # noqa: F401
from tools import rs_ground       # noqa: F401
from tools import change_describe # noqa: F401
from tools import change_vqa      # noqa: F401

# Google Earth Engine backends G1/G2 (PRD §7.3, §7.4) - online only
from tools import rs_classify     # noqa: F401
from tools import change_detect   # noqa: F401

# Cross-modal fusion (deterministic, offline-capable) - PRD §8.3.7
from tools import sar_optical_fuse  # noqa: F401
