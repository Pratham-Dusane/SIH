import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from routers import auth, workspaces, uploads, scenes, query, stats, tools as tools_router

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
