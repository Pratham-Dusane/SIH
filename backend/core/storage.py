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

    @abstractmethod
    def delete_prefix(self, prefix: str) -> None: ...


class LocalStorage(Storage):
    def __init__(self, root: str = None):
        self.root = Path(root or settings.LOCAL_STORAGE_ROOT).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def signed_upload_url(self, path: str, content_type: str) -> str:
        clean_path = path.strip("/\\")
        return f"{settings.API_BASE_URL}/api/uploads/local/{clean_path}"

    def local_path(self, path: str) -> str:
        clean_path = path.strip("/\\")
        dest = self.root / clean_path
        dest.parent.mkdir(parents=True, exist_ok=True)
        return str(dest)

    def put_file(self, local_src: str, dest_path: str) -> str:
        clean_path = dest_path.strip("/\\")
        dest = self.root / clean_path
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(local_src, dest)
        return str(dest)

    def public_url(self, path: str) -> str:
        clean_path = path.strip("/\\")
        return f"{settings.API_BASE_URL}/api/files/{clean_path}"

    def delete_prefix(self, prefix: str) -> None:
        clean_prefix = prefix.strip("/\\")
        target = self.root / clean_prefix
        if target.is_dir():
            shutil.rmtree(target, ignore_errors=True)
        elif target.is_file():
            target.unlink(missing_ok=True)


class GCSStorage(Storage):
    def __init__(self, bucket_name: str = None):
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
        clean_path = path.strip("/\\")
        return self.bucket.blob(clean_path).generate_signed_url(
            version="v4", expiration=timedelta(minutes=15),
            method="PUT", content_type=content_type,
        )

    def local_path(self, path: str) -> str:
        clean_path = path.strip("/\\")
        cache = Path("/tmp/satquery") / clean_path
        if not cache.exists():
            cache.parent.mkdir(parents=True, exist_ok=True)
            self.bucket.blob(clean_path).download_to_filename(cache)
        return str(cache)

    def put_file(self, local_src: str, dest_path: str) -> str:
        clean_path = dest_path.strip("/\\")
        blob = self.bucket.blob(clean_path)
        blob.upload_from_filename(local_src)
        return f"gs://{self.bucket_name}/{clean_path}"

    def public_url(self, path: str) -> str:
        clean_path = path.strip("/\\")
        return f"https://storage.googleapis.com/{self.bucket_name}/{clean_path}"

    def delete_prefix(self, prefix: str) -> None:
        clean_prefix = prefix.strip("/\\")
        blobs = self.bucket.list_blobs(prefix=clean_prefix)
        for b in blobs:
            b.delete()


def get_storage() -> Storage:
    if settings.STORAGE_BACKEND == "gcs":
        return GCSStorage()
    return LocalStorage()
