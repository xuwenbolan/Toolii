from __future__ import annotations

import io
import logging
import os
import re
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlencode

from app.core.config import settings
from app.core.security import sign_download
from app.utils.file_utils import ensure_dir

logger = logging.getLogger(__name__)

_FILE_ID_RE = re.compile(r"^[a-f0-9]{32}$")

# Thumbnail config
THUMB_MAX_SIZE = (400, 300)
THUMB_QUALITY = 80
_THUMBABLE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp"}


@dataclass(frozen=True)
class StoredFile:
    file_id: str
    path: Path
    size: int


def safe_filename(filename: str) -> str:
    name = os.path.basename(filename or "download")
    # Strip null bytes, newlines (header injection), quotes, and control chars
    name = re.sub(r'[\x00-\x1f\x7f"\\]', "", name).strip()
    # Limit length to prevent oversized headers
    if len(name) > 200:
        stem, dot, ext = name.rpartition(".")
        if dot and len(ext) <= 10:
            name = stem[: 200 - len(ext) - 1] + "." + ext
        else:
            name = name[:200]
    return name or "download"


class FileService:
    """Pure bytes store: save, get, delete by UUID. No metadata files."""

    def __init__(self, storage_dir: str | None = None) -> None:
        self._storage_dir = Path(storage_dir or settings.hub_storage_dir)
        ensure_dir(self._storage_dir)

    @staticmethod
    def _validate_file_id(file_id: str) -> None:
        if not _FILE_ID_RE.match(file_id):
            raise FileNotFoundError(file_id)

    def _file_path(self, file_id: str) -> Path:
        self._validate_file_id(file_id)
        return self._storage_dir / file_id[:2] / file_id[2:4] / file_id

    def save_bytes(self, data: bytes) -> StoredFile:
        file_id = uuid.uuid4().hex
        path = self._file_path(file_id)
        ensure_dir(path.parent)
        path.write_bytes(data)
        return StoredFile(file_id=file_id, path=path, size=len(data))

    def get_path(self, file_id: str) -> Path:
        path = self._file_path(file_id)
        if not path.exists():
            raise FileNotFoundError(file_id)
        return path

    def overwrite_bytes(self, file_id: str, data: bytes) -> int:
        path = self._file_path(file_id)
        if not path.exists():
            raise FileNotFoundError(file_id)
        tmp = path.with_name(f"{path.name}.{uuid.uuid4().hex}.tmp")
        tmp.write_bytes(data)
        tmp.replace(path)
        return len(data)

    def delete(self, file_id: str) -> None:
        self._validate_file_id(file_id)
        self._file_path(file_id).unlink(missing_ok=True)

    def generate_thumbnail(self, data: bytes, content_type: str) -> StoredFile | None:
        """Generate a WebP thumbnail for an image. Returns None on failure or non-image."""
        if content_type not in _THUMBABLE_TYPES:
            return None
        try:
            from PIL import Image

            img = Image.open(io.BytesIO(data))
            img.thumbnail(THUMB_MAX_SIZE, Image.LANCZOS)
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGBA" if content_type == "image/png" else "RGB")
            buf = io.BytesIO()
            img.save(buf, format="WEBP", quality=THUMB_QUALITY)
            return self.save_bytes(buf.getvalue())
        except Exception:
            logger.debug("Thumbnail generation failed", exc_info=True)
            return None


def build_download_url(*, file_id: str, filename: str, ttl_seconds: int | None = None) -> str:
    if ttl_seconds is None:
        ttl_seconds = settings.download_url_ttl
    exp = int(time.time()) + ttl_seconds
    safe_name = safe_filename(filename)
    sig = sign_download(file_id=file_id, filename=safe_name, exp=exp)
    qs = urlencode({"fn": safe_name, "exp": exp, "sig": sig})
    return f"{settings.api_prefix}/download/{file_id}?{qs}"
