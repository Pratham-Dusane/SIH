"""
Runtime configuration — PRD §15.

Every value here is an environment-variable switch.  Design Rule 5: the same
code path runs locally and on GCP; only these values change.
"""

import os

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ------------------------------------------------------------------
    # Runtime switches (Design Rule 5 & PRD §2.4)
    # ------------------------------------------------------------------
    STORAGE_BACKEND: str = os.getenv("STORAGE_BACKEND", "local")   # local | gcs
    DB_BACKEND: str = os.getenv("DB_BACKEND", "sqlite")            # sqlite | firestore
    PLANNER_BACKEND: str = os.getenv("PLANNER_BACKEND", "local")   # local | vertex
    FUSION_BACKEND: str = os.getenv("FUSION_BACKEND", "template")  # template | vertex
    AUTH_DISABLED: bool = os.getenv("AUTH_DISABLED", "true").lower() == "true"

    # Offline evaluation mode — PRD §11.5 / Design Rule 3.
    # When true, no tool with offline_capable=False may attempt a network call;
    # each returns a structured NOT_EVALUATED_OFFLINE result instead.
    OFFLINE_MODE: bool = os.getenv("OFFLINE_MODE", "false").lower() == "true"

    # ------------------------------------------------------------------
    # Local paths
    # ------------------------------------------------------------------
    LOCAL_STORAGE_ROOT: str = os.getenv("LOCAL_STORAGE_ROOT", "./_data")
    SQLITE_PATH: str = os.getenv("SQLITE_PATH", "./_data/satquery.db")
    API_BASE_URL: str = os.getenv("API_BASE_URL", "http://localhost:8080")

    # ------------------------------------------------------------------
    # VLM gateway — PRD §7.1
    # ------------------------------------------------------------------
    # gemini = AI Studio API key | vertex = Vertex AI on your own GCP project
    # | gpt4v | claude
    VLM_BACKEND: str = os.getenv("VLM_BACKEND", "vertex")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")

    # ------------------------------------------------------------------
    # Vertex AI — the same Gemini models served from your own GCP project.
    #
    # The AI Studio free tier caps some models at 20 requests/day per project,
    # which is unusable for a live demo.  Vertex is billed per token instead of
    # rationed, and authenticates with the *same* service-account JSON as Earth
    # Engine — so one credential file serves both hosted backends.
    # ------------------------------------------------------------------
    VERTEX_PROJECT: str = os.getenv("VERTEX_PROJECT", "")   # defaults to GEE_PROJECT
    VERTEX_LOCATION: str = os.getenv("VERTEX_LOCATION", "global")
    VERTEX_MODEL: str = os.getenv("VERTEX_MODEL", "gemini-3.5-flash")
    VERTEX_KEY_PATH: str = os.getenv("VERTEX_KEY_PATH", "")  # defaults to GEE_KEY_PATH

    # Per-provider model ids.  The PRD names `gemini-1.5-pro-vision` in the
    # example backend card (§7.6); that model id is retired upstream, so the
    # concrete id lives here as a switch and is reported verbatim in the
    # backend card and in every ToolResult.model_version.
    #
    # gemini-3.6-flash is the verified default: it returns bounding boxes in the
    # normalised [0,1] form rs_ground parses.  gemini-3.5-flash answers on a
    # 0-1000 scale, which parse_bbox correctly rejects as out of range (§8.3.3),
    # so grounding degrades to honest negatives on that model.
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o")
    ANTHROPIC_MODEL: str = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5")
    VLM_TIMEOUT_S: float = float(os.getenv("VLM_TIMEOUT_S", "90"))
    # Gemini 3.x spends output budget on internal reasoning before it emits any
    # text (400-800 tokens even on a one-line answer), so this ceiling covers
    # thinking + answer.  Too low and the response comes back empty.
    VLM_MAX_TOKENS: int = int(os.getenv("VLM_MAX_TOKENS", "2048"))
    # "low" | "high" — low cuts thinking roughly in half at no measured cost on
    # these extraction tasks.  Ignored by providers that do not support it.
    GEMINI_THINKING_LEVEL: str = os.getenv("GEMINI_THINKING_LEVEL", "low")

    # ------------------------------------------------------------------
    # Google Earth Engine — PRD §7.2
    # ------------------------------------------------------------------
    GEE_SERVICE_ACCOUNT: str = os.getenv("GEE_SERVICE_ACCOUNT", "")
    GEE_KEY_PATH: str = os.getenv("GEE_KEY_PATH", "")
    GEE_PROJECT: str = os.getenv("GEE_PROJECT", "")

    # ------------------------------------------------------------------
    # Resolved accessors — Vertex falls back to the Earth Engine credentials
    # so a single service-account JSON configures both hosted backends.
    # ------------------------------------------------------------------
    @property
    def vertex_project(self) -> str:
        return self.VERTEX_PROJECT or self.GEE_PROJECT

    @property
    def vertex_key_path(self) -> str:
        return self.VERTEX_KEY_PATH or self.GEE_KEY_PATH

    # ------------------------------------------------------------------
    # Agent tuning — PRD §15
    # ------------------------------------------------------------------
    ABSTAIN_THRESHOLD: float = float(os.getenv("ABSTAIN_THRESHOLD", "0.35"))
    MAX_PLAN_STEPS: int = int(os.getenv("MAX_PLAN_STEPS", "8"))
    DEFAULT_SELF_CONSISTENCY: int = int(os.getenv("DEFAULT_SELF_CONSISTENCY", "3"))
    TILE_THRESHOLD_PX: int = int(os.getenv("TILE_THRESHOLD_PX", str(4096 * 4096)))
    TILE_SIZE: int = int(os.getenv("TILE_SIZE", "1024"))
    TILE_OVERLAP: int = int(os.getenv("TILE_OVERLAP", "128"))

    # ------------------------------------------------------------------
    # GCP & Firebase (Section 17; unused while STORAGE_BACKEND=local)
    # ------------------------------------------------------------------
    GCP_PROJECT_ID: str = os.getenv("GCP_PROJECT_ID", "sih-auth-a5cb4")
    GCP_REGION: str = os.getenv("GCP_REGION", "asia-south1")
    GCS_BUCKET_NAME: str = os.getenv("GCS_BUCKET_NAME", "satquery-scenes")

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
