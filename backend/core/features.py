"""
Feature flags & capability discovery — Extensions PRD §3.2.

Every feature is off by default (FEATURE_{ID}_ENABLED=false).
A disabled feature's endpoints 404, its panels don't render,
and its imports never execute.
"""

import os
from fastapi import HTTPException


FEATURE_IDS = [
    "enhancement",      # F1
    "annotation",       # F2
    "temporal_fetch",   # F3
    "stack",            # F4
    "historical",       # F5
    "causal",           # F6
    "geo3d",            # F7
    "voice",            # F8
    "reports",          # F9
    "monitor",          # F10
    "live",             # F11
    "location_history", # F12
]


def enabled(fid: str) -> bool:
    """Check if a feature is enabled via Settings or its environment variable."""
    from core.config import settings
    attr_name = f"FEATURE_{fid.upper()}_ENABLED"
    if hasattr(settings, attr_name):
        return bool(getattr(settings, attr_name))
    return os.getenv(attr_name, "false").lower() == "true"


def capability_map() -> dict[str, bool]:
    """Full feature map — served at GET /api/features, consumed once per frontend session."""
    return {f: enabled(f) for f in FEATURE_IDS}


def require(fid: str):
    """
    FastAPI dependency.  A disabled feature's endpoints 404 with a clear message,
    they do not 500.
    """
    def _guard():
        if not enabled(fid):
            raise HTTPException(404, f"Feature '{fid}' is not enabled on this deployment")
    return _guard
