import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Runtime switches (Design Rule 5 & PRD §2.4)
    STORAGE_BACKEND: str = os.getenv("STORAGE_BACKEND", "local")  # local | gcs
    DB_BACKEND: str = os.getenv("DB_BACKEND", "sqlite")          # sqlite | firestore
    PLANNER_BACKEND: str = os.getenv("PLANNER_BACKEND", "local")  # local | vertex
    FUSION_BACKEND: str = os.getenv("FUSION_BACKEND", "template")# template | vertex
    AUTH_DISABLED: bool = os.getenv("AUTH_DISABLED", "true").lower() == "true" # true for dev / offline eval

    # Local paths
    LOCAL_STORAGE_ROOT: str = os.getenv("LOCAL_STORAGE_ROOT", "./_data")
    SQLITE_PATH: str = os.getenv("SQLITE_PATH", "./_data/satquery.db")
    API_BASE_URL: str = os.getenv("API_BASE_URL", "http://localhost:8080")

    # GCP & Firebase
    GCP_PROJECT_ID: str = os.getenv("GCP_PROJECT_ID", "sih-auth-a5cb4")
    GCP_REGION: str = os.getenv("GCP_REGION", "asia-south1")
    GCS_BUCKET_NAME: str = os.getenv("GCS_BUCKET_NAME", "satquery-scenes")

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
