from __future__ import annotations

import json
import os
import re
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

from app.core.config import settings
from app.core.security import sign_download
from app.utils.file_utils import ensure_dir

_FILE_ID_RE = re.compile(r"^[a-f0-9]{32}$")


@dataclass(frozen=True)
class StoredFile:
    file_id: str
    path: Path
    size: int
    content_type: str
    original_filename: str
    created_at: int


def _safe_filename(filename: str) -> str:
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
    def __init__(self, storage_dir: str | None = None) -> None:
        self._storage_dir = Path(storage_dir or settings.file_storage_dir)
        ensure_dir(self._storage_dir)

    @staticmethod
    def _validate_file_id(file_id: str) -> None:
        if not _FILE_ID_RE.match(file_id):
            raise FileNotFoundError(file_id)

    def _file_path(self, file_id: str) -> Path:
        self._validate_file_id(file_id)
        return self._storage_dir / file_id[:2] / file_id[2:4] / file_id

    def _meta_path(self, file_id: str) -> Path:
        return self._file_path(file_id).with_suffix(".json")

    def save_bytes(
        self,
        *,
        data: bytes,
        filename: str,
        content_type: str,
        extra_meta: dict[str, Any] | None = None,
    ) -> StoredFile:
        file_id = uuid.uuid4().hex
        path = self._file_path(file_id)
        ensure_dir(path.parent)
        path.write_bytes(data)

        created_at = int(time.time())
        meta: dict[str, Any] = {
            "file_id": file_id,
            "size": len(data),
            "content_type": content_type,
            "original_filename": _safe_filename(filename),
            "created_at": created_at,
        }
        if extra_meta:
            meta.update(extra_meta)
        self._meta_path(file_id).write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")

        return StoredFile(
            file_id=file_id,
            path=path,
            size=len(data),
            content_type=content_type,
            original_filename=_safe_filename(filename),
            created_at=created_at,
        )

    def get(self, file_id: str) -> StoredFile:
        path = self._file_path(file_id)
        if not path.exists():
            raise FileNotFoundError(file_id)

        meta_path = self._meta_path(file_id)
        meta: dict[str, Any] = {}
        if meta_path.exists():
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError, ValueError):
                meta = {}

        content_type = str(meta.get("content_type") or "application/octet-stream")
        original_filename = str(meta.get("original_filename") or "download")
        created_at = int(meta.get("created_at") or int(path.stat().st_mtime))
        size = int(meta.get("size") or path.stat().st_size)

        return StoredFile(
            file_id=file_id,
            path=path,
            size=size,
            content_type=content_type,
            original_filename=original_filename,
            created_at=created_at,
        )

    def get_meta(self, file_id: str) -> dict[str, Any]:
        """Return the metadata dict for a stored file."""
        meta_path = self._meta_path(file_id)
        if not meta_path.exists():
            raise FileNotFoundError(file_id)
        return json.loads(meta_path.read_text(encoding="utf-8"))

    def delete(self, file_id: str) -> None:
        """Delete a stored file and its metadata."""
        self._validate_file_id(file_id)
        self._file_path(file_id).unlink(missing_ok=True)
        self._meta_path(file_id).unlink(missing_ok=True)

    def build_download_url(self, *, file_id: str, filename: str, ttl_seconds: int | None = None) -> str:
        ttl = ttl_seconds if ttl_seconds is not None else settings.file_retention_hours * 3600
        exp = int(time.time()) + int(ttl)
        safe_name = _safe_filename(filename)
        sig = sign_download(file_id=file_id, filename=safe_name, exp=exp)
        qs = urlencode({"fn": safe_name, "exp": exp, "sig": sig})
        return f"{settings.api_prefix}/download/{file_id}?{qs}"

    def cleanup_expired_files(self) -> int:
        cutoff = time.time() - (settings.file_retention_hours * 3600)
        removed = 0

        if not self._storage_dir.exists():
            return 0

        for path in self._storage_dir.rglob("*"):
            if not path.is_file():
                continue
            if path.suffix == ".json":
                continue
            try:
                if path.stat().st_mtime > cutoff:
                    continue
            except FileNotFoundError:
                continue

            file_id = path.name
            try:
                path.unlink(missing_ok=True)
                self._meta_path(file_id).unlink(missing_ok=True)
                removed += 1
            except OSError:
                continue

        return removed
