import importlib
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from core import features
from routers import auth, workspaces, uploads, scenes, query, stats, tools as tools_router, reports

# Import tools package to trigger @register decorators at startup
import tools  # noqa: F401

# Force settings reload
from core.config import settings

log = logging.getLogger(__name__)

app = FastAPI(
    title="SatQuery AI Backend API",
    description="Agentic Vision-Language Assistant API for Multimodal Remote Sensing (ISRO / SAC)",
    version="1.0.0",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Routers
app.include_router(auth.router)
app.include_router(workspaces.router)
app.include_router(uploads.router)
app.include_router(scenes.router)
app.include_router(query.router)
app.include_router(stats.router)
app.include_router(tools_router.router)
app.include_router(reports.router)  # Phase 7 - evidence & reporting

# ---------------------------------------------------------------------------
# Feature-gated routers (Extensions PRD §3.2)
# Each feature's endpoints mount only when enabled, contributing no routes,
# no imports, and no startup cost when disabled.
# ---------------------------------------------------------------------------
OPTIONAL_ROUTERS = {
    "enhancement":      "features.enhancement.router",
    "annotation":       "features.annotation.router",
    "historical":       "features.historical.router",
    "location_history": "features.location_history.router",
}
for fid, module_path in OPTIONAL_ROUTERS.items():
    if features.enabled(fid):
        try:
            mod = importlib.import_module(module_path)
            app.include_router(mod.router)
            logging.getLogger(__name__).info("Feature '%s' enabled — router mounted", fid)
        except Exception as e:
            logging.getLogger(__name__).warning("Feature '%s' router failed to load: %s", fid, e)


@app.on_event("startup")
async def startup_backends():
    """
    Earth Engine is a startup-time dependency for the GEE-backed tools (PRD §7.2).
    If init fails, those tools mark lemons as unavailable - it is never a crash.
    Also seeds demo scenes (scn_single_01) so real queries run on sample GeoTIFFs.
    """
    from core.db import get_db
    from services.ingest.seed import seed_demo_scenes
    from core.gee import init_gee, gee_status
    from services.inference.vlm_gateway import gateway_status

    db = get_db()
    seed_demo_scenes(db)

    init_gee()
    gee = gee_status()
    vlm = gateway_status()
    log.info("VLM gateway: backend=%s configured=%s (%s)",
             vlm["vlm_backend"], vlm["configured"], vlm["reason"])
    log.info("Earth Engine: initialized=%s (%s)", gee["gee_initialized"], gee["reason"])

    # Pre-load admin boundaries (Extensions PRD §3.5)
    try:
        from core.geo.admin_lookup import get_admin_lookup
        lookup = get_admin_lookup()
        log.info("AdminLookup: %d districts loaded (vintage: %s)",
                 lookup.count, lookup.version)
    except Exception as e:
        log.warning("AdminLookup failed to load: %s", e)

    # Log enabled features
    enabled = [fid for fid in features.FEATURE_IDS if features.enabled(fid)]
    log.info("Enabled features: %s", enabled if enabled else "(none)")


@app.get("/api/features")
async def get_features():
    """Extensions PRD §3.2: capability map consumed once per frontend session."""
    return features.capability_map()


@app.get("/")
async def root():
    return {
        "name": "SatQuery AI API",
        "status": "online",
        "storage_backend": settings.STORAGE_BACKEND,
        "db_backend": settings.DB_BACKEND,
        "auth_disabled": settings.AUTH_DISABLED,
        "offline_mode": settings.OFFLINE_MODE,
    }


@app.get("/health")
async def health():
    """PRD §14: GET /health -> {vlm_backend, gee_initialized: bool}."""
    from core.gee import gee_status
    from services.inference.vlm_gateway import gateway_status

    vlm = gateway_status()
    gee = gee_status()
    return {
        "status": "ok",
        "service": "satquery-api",
        "vlm_backend": vlm["vlm_backend"],
        "vlm_configured": vlm["configured"],
        "gee_initialized": gee["gee_initialized"],
        "offline_mode": settings.OFFLINE_MODE,
    }


@app.get("/api/health")
async def health_check():
    return await health()
