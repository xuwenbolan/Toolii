from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import AppError
from app.models.user_file import (
    FileSource,
    FileStatus,
    UserFile,
)
from app.services.file_service import FileService, safe_filename
from app.utils.time_utils import utcnow

logger = logging.getLogger(__name__)

ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp"}

# Each entry is a list of check-groups. ALL groups must pass.
# Each group is a list of (bytes, offset) alternatives -- ANY one must match.
_MAGIC_BYTES: dict[str, list[list[tuple[bytes, int]]]] = {
    "image/png": [[(b"\x89PNG\r\n\x1a\n", 0)]],
    "image/jpeg": [[(b"\xff\xd8\xff", 0)]],
    "image/gif": [[(b"GIF87a", 0), (b"GIF89a", 0)]],  # either version
    "image/webp": [[(b"RIFF", 0)], [(b"WEBP", 8)]],   # both must match
}

_IMAGE_URL_PREFIX = f"{settings.api_prefix}/hub/images/"
_IMAGE_REF_RE = re.compile(re.escape(_IMAGE_URL_PREFIX) + r"([a-f0-9]{32})")

_MARKDOWN_MAX_BYTES = 1024 * 1024


def _validate_image_magic(data: bytes, content_type: str) -> bool:
    """Check that file header bytes match the declared content type."""
    groups = _MAGIC_BYTES.get(content_type)
    if not groups:
        return False
    for alternatives in groups:
        if not any(
            len(data) >= offset + len(magic) and data[offset:offset + len(magic)] == magic
            for magic, offset in alternatives
        ):
            return False
    return True


def _is_markdown_filename(filename: str) -> bool:
    return filename.lower().endswith(".md")


class HubUploadService:
    """Handles file uploads, thumbnail generation, and editor image management."""

    def __init__(self, db: AsyncSession, fs: FileService, check_quota_fn) -> None:
        self._db = db
        self._fs = fs
        self._check_quota = check_quota_fn

    async def save_upload(
        self,
        *,
        user_id: int,
        data: bytes,
        filename: str,
        content_type: str,
        retention_days: int = 7,
        max_days: int = 7,
    ) -> UserFile:
        max_bytes = settings.max_hub_file_mb * 1024 * 1024
        if len(data) > max_bytes:
            raise AppError(
                code="FILE_TOO_LARGE",
                message=f"File exceeds {settings.max_hub_file_mb} MB limit",
                status_code=413,
            )

        await self._check_quota(user_id, additional_bytes=len(data), additional_count=1)

        stored = self._fs.save_bytes(data)

        if max_days == 0:
            # Unlimited retention -- no expiration
            expires = None
        else:
            days = min(max(retention_days, 1), max_days)
            expires = utcnow() + timedelta(days=days)

        # Generate thumbnail for image files
        thumb = await asyncio.to_thread(
            self._fs.generate_thumbnail, data, content_type
        )

        try:
            uf = UserFile(
                user_id=user_id,
                file_id=stored.file_id,
                original_filename=safe_filename(filename),
                size=stored.size,
                content_type=content_type,
                source=FileSource.UPLOAD,
                expires_at=expires,
                thumb_file_id=thumb.file_id if thumb else None,
            )
            self._db.add(uf)
            await self._db.flush()
        except Exception:
            # Clean up orphaned files if DB insert fails
            for fid in (stored.file_id, thumb.file_id if thumb else None):
                if fid:
                    try:
                        self._fs.delete(fid)
                    except OSError:
                        pass
            raise
        return uf

    async def save_tool_result(
        self,
        *,
        user_id: int | None,
        file_id: str,
        filename: str,
        content_type: str,
        size: int,
        meta: dict[str, Any] | None = None,
    ) -> UserFile:
        """Register a file already saved by FileService as a tool result."""
        if user_id is not None:
            ttl = timedelta(hours=24)
        else:
            ttl = timedelta(hours=1)

        # Generate thumbnail for image tool results
        thumb_file_id = None
        try:
            path = self._fs.get_path(file_id)
            data = await asyncio.to_thread(path.read_bytes)
            thumb = await asyncio.to_thread(
                self._fs.generate_thumbnail, data, content_type
            )
            if thumb:
                thumb_file_id = thumb.file_id
        except Exception:
            pass

        try:
            uf = UserFile(
                user_id=user_id,
                file_id=file_id,
                original_filename=safe_filename(filename),
                size=size,
                content_type=content_type,
                source=FileSource.TOOL_RESULT,
                expires_at=utcnow() + ttl,
                meta=json.dumps(meta) if meta else None,
                thumb_file_id=thumb_file_id,
            )
            self._db.add(uf)
            await self._db.flush()
        except Exception:
            # Clean up orphaned thumbnail if DB insert fails
            if thumb_file_id:
                try:
                    self._fs.delete(thumb_file_id)
                except OSError:
                    pass
            raise
        return uf

    async def upload_editor_image(
        self,
        doc_id: int,
        user_id: int,
        *,
        parent: UserFile,
        filename: str,
        data: bytes,
        content_type: str,
    ) -> tuple[str, str]:
        """Upload an image for a markdown document. Returns (file_id, url)."""
        if content_type not in ALLOWED_IMAGE_TYPES:
            raise AppError(
                code="INVALID_IMAGE_TYPE",
                message="Only PNG, JPEG, GIF, and WebP images are supported",
                status_code=400,
            )

        if not _validate_image_magic(data, content_type):
            raise AppError(
                code="INVALID_IMAGE_DATA",
                message="File content does not match declared image type",
                status_code=400,
            )

        max_bytes = settings.max_editor_image_mb * 1024 * 1024
        if len(data) > max_bytes:
            raise AppError(
                code="IMAGE_TOO_LARGE",
                message=f"Image exceeds {settings.max_editor_image_mb} MB limit",
                status_code=413,
            )

        await self._check_quota(user_id, additional_bytes=len(data), additional_count=1)

        stored = self._fs.save_bytes(data)

        if parent.expires_at is None:
            # Unlimited parent -- pending image expires in 24h as safety net
            expires = utcnow() + timedelta(hours=24)
        else:
            expires = parent.expires_at

        try:
            uf = UserFile(
                user_id=user_id,
                file_id=stored.file_id,
                original_filename=safe_filename(filename),
                size=stored.size,
                content_type=content_type,
                source=FileSource.EDITOR_IMAGE,
                status=FileStatus.PENDING,
                parent_file_id=parent.id,
                expires_at=expires,
            )
            self._db.add(uf)
            await self._db.flush()
        except Exception:
            # DB row never committed -- remove the file we just wrote so
            # the storage dir does not grow with unreachable blobs.
            try:
                self._fs.delete(stored.file_id)
            except OSError:
                pass
            raise
        return stored.file_id, f"{_IMAGE_URL_PREFIX}{stored.file_id}"

    async def get_editor_image(self, storage_file_id: str) -> tuple[Path, str]:
        """Look up an editor image by storage UUID. Returns (file_path, content_type)."""
        result = await self._db.execute(
            select(UserFile).where(
                UserFile.file_id == storage_file_id,
                UserFile.source == FileSource.EDITOR_IMAGE,
                UserFile.status.in_([FileStatus.PENDING, FileStatus.ACTIVE]),
            )
        )
        uf = result.scalar_one_or_none()
        if not uf or (uf.expires_at and _is_expired_at(uf.expires_at)):
            raise AppError(code="NOT_FOUND", message="Image not found", status_code=404)

        if uf.content_type not in ALLOWED_IMAGE_TYPES:
            raise AppError(code="NOT_FOUND", message="Image not found", status_code=404)

        path = self._fs.get_path(storage_file_id)
        return path, uf.content_type

    async def gc_editor_images(self, doc_id: int, content: str, parent_expires_at=None) -> None:
        """Delete unreferenced editor images, confirm referenced ones."""
        referenced_ids = set(_IMAGE_REF_RE.findall(content))

        result = await self._db.execute(
            select(UserFile).where(
                UserFile.parent_file_id == doc_id,
                UserFile.source == FileSource.EDITOR_IMAGE,
                UserFile.status.in_([FileStatus.PENDING, FileStatus.ACTIVE]),
            )
        )
        images = list(result.scalars().all())
        if not images:
            return

        for img in images:
            if img.file_id in referenced_ids:
                img.status = FileStatus.ACTIVE
                img.expires_at = parent_expires_at
            else:
                try:
                    self._fs.delete(img.file_id)
                    img.status = FileStatus.DELETED
                except Exception:
                    logger.warning("Failed to delete orphaned editor image %s", img.file_id, exc_info=True)

    async def sync_editor_image_expiry(self, doc_id: int, new_expires_at) -> None:
        """Update expires_at on all active editor images for a document."""
        await self._db.execute(
            update(UserFile)
            .where(
                UserFile.parent_file_id == doc_id,
                UserFile.source == FileSource.EDITOR_IMAGE,
                UserFile.status == FileStatus.ACTIVE,
            )
            .values(expires_at=new_expires_at)
        )

    async def cascade_delete_editor_images(self, doc_id: int) -> None:
        """Delete all editor images belonging to a parent document."""
        result = await self._db.execute(
            select(UserFile).where(
                UserFile.parent_file_id == doc_id,
                UserFile.source == FileSource.EDITOR_IMAGE,
                UserFile.status.in_([FileStatus.PENDING, FileStatus.ACTIVE]),
            )
        )
        images = list(result.scalars().all())
        for img in images:
            try:
                self._fs.delete(img.file_id)
                img.status = FileStatus.DELETED
            except Exception:
                logger.warning("Failed to delete editor image %s", img.file_id, exc_info=True)


def _is_expired_at(value) -> bool:
    if value is None:
        return False
    now = utcnow()
    if value.tzinfo is None:
        return value < now.replace(tzinfo=None)
    return value < now
