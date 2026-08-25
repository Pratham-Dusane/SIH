from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from core.config import settings
from routers import auth, workspaces, uploads, scenes

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

@app.get("/")
async def root():
    return {
        "name": "SatQuery AI API",
        "status": "online",
        "storage_backend": settings.STORAGE_BACKEND,
        "db_backend": settings.DB_BACKEND,
        "auth_disabled": settings.AUTH_DISABLED,
    }

@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "satquery-api"}
