import os
import shutil
from abc import ABC, abstractmethod
from pathlib import Path
from core.config import settings

class Storage(ABC):
    @abstractmethod
    def signed_upload_url(self, path: str, content_type: str) -> str: ...

    @abstractmethod
    def local_path(self, path: str) -> str: ...

    @abstractmethod
    def put_file(self, local_src: str, dest_path: str) -> str: ...

    @abstractmethod
    def public_url(self, path: str) -> str: ...


class LocalStorage(Storage):
    def __init__(self, root: str = None):
        self.root = Path(root or settings.LOCAL_STORAGE_ROOT)
        self.root.mkdir(parents=True, exist_ok=True)

    def signed_upload_url(self, path: str, content_type: str) -> str:
        return f"{settings.API_BASE_URL}/api/uploads/local/{path}"

    def local_path(self, path: str) -> str:
        return str(self.root / path)

    def put_file(self, local_src: str, dest_path: str) -> str:
        dest = self.root / dest_path
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(local_src, dest)
        return str(dest)

    def public_url(self, path: str) -> str:
        return f"{settings.API_BASE_URL}/api/files/{path}"


class GCSStorage(Storage):
    def __init__(self, bucket_name: str = None):
        from google.cloud import storage as gcs
        self.bucket_name = bucket_name or settings.GCS_BUCKET_NAME
        self._bucket = None

    @property
    def bucket(self):
        if self._bucket is None:
            from google.cloud import storage as gcs
            self._bucket = gcs.Client().bucket(self.bucket_name)
        return self._bucket

    def signed_upload_url(self, path: str, content_type: str) -> str:
        from datetime import timedelta
        return self.bucket.blob(path).generate_signed_url(
            version="v4", expiration=timedelta(minutes=15),
            method="PUT", content_type=content_type,
        )

    def local_path(self, path: str) -> str:
        cache = Path("/tmp/satquery") / path
        if not cache.exists():
            cache.parent.mkdir(parents=True, exist_ok=True)
            self.bucket.blob(path).download_to_filename(cache)
        return str(cache)

    def put_file(self, local_src: str, dest_path: str) -> str:
        blob = self.bucket.blob(dest_path)
        blob.upload_from_filename(local_src)
        return f"gs://{self.bucket_name}/{dest_path}"

    def public_url(self, path: str) -> str:
        return f"https://storage.googleapis.com/{self.bucket_name}/{path}"


def get_storage() -> Storage:
    if settings.STORAGE_BACKEND == "gcs":
        return GCSStorage()
    return LocalStorage()
