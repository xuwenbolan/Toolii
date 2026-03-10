from __future__ import annotations

import asyncio
import json
import logging
import re
import secrets
import string
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import AppError
from app.models.user import User
from app.models.user_file import (
    FileSource,
    FileStatus,
    ShareGroup,
    ShareGroupFile,
    ShareGroupStatus,
    UserFile,
)
from app.services.file_service import FileService, safe_filename
from app.utils.time_utils import utcnow

logger = logging.getLogger(__name__)

_TOKEN_CHARS = string.ascii_letters + string.digits
_CODE_CHARS = string.ascii_lowercase + string.digits
_MARKDOWN_MAX_BYTES = 1024 * 1024

ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp"}

# Each entry is a list of check-groups. ALL groups must pass.
# Each group is a list of (bytes, offset) alternatives — ANY one must match.
_MAGIC_BYTES: dict[str, list[list[tuple[bytes, int]]]] = {
    "image/png": [[(b"\x89PNG\r\n\x1a\n", 0)]],
    "image/jpeg": [[(b"\xff\xd8\xff", 0)]],
    "image/gif": [[(b"GIF87a", 0), (b"GIF89a", 0)]],  # either version
    "image/webp": [[(b"RIFF", 0)], [(b"WEBP", 8)]],   # both must match
}

_IMAGE_URL_PREFIX = f"{settings.api_prefix}/hub/images/"
_IMAGE_REF_RE = re.compile(re.escape(_IMAGE_URL_PREFIX) + r"([a-f0-9]{32})")


def _is_markdown_filename(filename: str) -> bool:
    return filename.lower().endswith(".md")


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


def _is_expired_at(value) -> bool:
    if value is None:
        return False
    now = utcnow()
    if value.tzinfo is None:
        return value < now.replace(tzinfo=None)
    return value < now


def _gen_token(length: int = 8) -> str:
    return "".join(secrets.choice(_TOKEN_CHARS) for _ in range(length))


def _gen_code(length: int = 6) -> str:
    return "".join(secrets.choice(_CODE_CHARS) for _ in range(length))


class HubService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._fs = FileService()

    # ── Per-user limits ─────────────────────────────────────────────

    async def _get_user_limits(self, user_id: int) -> tuple[int, int, int]:
        """Return effective (max_bytes, max_files, max_retention_days) for a user.

        Convention: DB value NULL = global default, 0 = unlimited.
        """
        result = await self._db.execute(
            select(User.hub_quota_mb, User.hub_max_files, User.hub_max_retention_days)
            .where(User.id == user_id)
        )
        row = result.one_or_none()

        if row is None:
            return (
                settings.max_hub_total_mb * 1024 * 1024,
                settings.max_hub_files,
                7,
            )

        quota_mb, max_files, max_days = row

        eff_bytes = (
            settings.max_hub_total_mb * 1024 * 1024 if quota_mb is None
            else 0 if quota_mb == 0
            else quota_mb * 1024 * 1024
        )
        eff_files = (
            settings.max_hub_files if max_files is None
            else 0 if max_files == 0
            else max_files
        )
        eff_days = (
            7 if max_days is None
            else 0 if max_days == 0
            else max_days
        )
        return eff_bytes, eff_files, eff_days

    # ── Quota helpers ────────────────────────────────────────────────

    async def _check_quota(self, user_id: int, additional_bytes: int = 0, additional_count: int = 0) -> None:
        max_bytes, max_files, _ = await self._get_user_limits(user_id)

        result = await self._db.execute(
            select(
                func.coalesce(func.sum(UserFile.size), 0),
                func.count(),
            ).where(
                UserFile.user_id == user_id,
                UserFile.status.in_([FileStatus.ACTIVE, FileStatus.PENDING]),
            )
        )
        used_bytes, file_count = result.one()

        if max_bytes > 0 and used_bytes + additional_bytes > max_bytes:
            raise AppError(
                code="QUOTA_EXCEEDED",
                message="Storage quota exceeded",
                status_code=413,
            )
        if max_files > 0 and file_count + additional_count > max_files:
            raise AppError(
                code="FILE_LIMIT_EXCEEDED",
                message=f"Maximum {max_files} files allowed",
                status_code=413,
            )

    async def get_usage(self, user_id: int) -> dict:
        """Return storage usage stats. 0 means unlimited for quota/max fields."""
        max_bytes, max_files, max_days = await self._get_user_limits(user_id)
        # Include PENDING to match _check_quota (pending editor images count toward quota)
        result = await self._db.execute(
            select(
                func.coalesce(func.sum(UserFile.size), 0),
                func.count(),
            ).where(
                UserFile.user_id == user_id,
                UserFile.status.in_([FileStatus.ACTIVE, FileStatus.PENDING]),
            )
        )
        used_bytes, file_count = result.one()
        return {
            "used_bytes": int(used_bytes),
            "quota_bytes": max_bytes,
            "file_count": int(file_count),
            "max_files": max_files,
            "max_retention_days": max_days,
        }

    # ── Save files ───────────────────────────────────────────────────

    async def save_upload(
        self,
        *,
        user_id: int,
        data: bytes,
        filename: str,
        content_type: str,
        retention_days: int = 7,
    ) -> UserFile:
        max_bytes = settings.max_hub_file_mb * 1024 * 1024
        if len(data) > max_bytes:
            raise AppError(
                code="FILE_TOO_LARGE",
                message=f"File exceeds {settings.max_hub_file_mb} MB limit",
                status_code=413,
            )

        await self._check_quota(user_id, additional_bytes=len(data), additional_count=1)

        _, _, max_days = await self._get_user_limits(user_id)
        stored = self._fs.save_bytes(data)

        if max_days == 0:
            # Unlimited retention — no expiration
            expires = None
        else:
            days = min(max(retention_days, 1), max_days)
            expires = utcnow() + timedelta(days=days)

        # Generate thumbnail for image files
        thumb = await asyncio.to_thread(
            self._fs.generate_thumbnail, data, content_type
        )

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
        return uf

    # ── File management ──────────────────────────────────────────────

    async def list_files(
        self,
        user_id: int,
        *,
        page: int = 1,
        page_size: int = 20,
        source: str | None = None,
    ) -> tuple[list[UserFile], int]:
        base = select(UserFile).where(
            UserFile.user_id == user_id,
            UserFile.status == FileStatus.ACTIVE,
            UserFile.source != FileSource.EDITOR_IMAGE,
        )
        if source:
            base = base.where(UserFile.source == source)

        count_result = await self._db.execute(
            select(func.count()).select_from(base.subquery())
        )
        total = count_result.scalar_one()

        offset = (max(page, 1) - 1) * page_size
        rows = await self._db.execute(
            base.order_by(UserFile.created_at.desc())
            .offset(offset)
            .limit(min(page_size, 100))
        )
        return list(rows.scalars().all()), total

    async def get_file(self, file_id: int, user_id: int) -> UserFile:
        result = await self._db.execute(
            select(UserFile).where(
                UserFile.id == file_id,
                UserFile.user_id == user_id,
                UserFile.status == FileStatus.ACTIVE,
            )
        )
        uf = result.scalar_one_or_none()
        if not uf:
            raise AppError(code="NOT_FOUND", message="File not found", status_code=404)
        return uf

    async def get_file_detail(self, file_id: int, user_id: int) -> UserFile:
        return await self.get_file(file_id, user_id)

    async def get_markdown_content(self, file_id: int, user_id: int) -> tuple[str, str]:
        uf = await self.get_file(file_id, user_id)
        if not _is_markdown_filename(uf.original_filename):
            raise AppError(
                code="NOT_MARKDOWN",
                message="This file is not a Markdown document",
                status_code=400,
            )
        try:
            raw = await asyncio.to_thread(self._fs.get_path(uf.file_id).read_bytes)
            content = raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise AppError(
                code="INVALID_CONTENT",
                message="This file cannot be displayed as Markdown",
                status_code=422,
            ) from exc
        return content, uf.updated_at.isoformat()

    async def rename_file(self, file_id: int, user_id: int, new_name: str) -> UserFile:
        uf = await self.get_file(file_id, user_id)
        safe_name = safe_filename(new_name)
        if _is_markdown_filename(uf.original_filename):
            if not _is_markdown_filename(safe_name):
                if "." in safe_name:
                    raise AppError(
                        code="INVALID_MARKDOWN_FILENAME",
                        message="Markdown documents must keep the .md extension",
                        status_code=400,
                    )
                safe_name = f"{safe_name}.md"
        uf.original_filename = safe_name
        await self._db.flush()
        return uf

    async def save_markdown_content(
        self,
        file_id: int,
        user_id: int,
        *,
        content: str,
        base_updated_at: str,
    ) -> UserFile:
        uf = await self.get_file(file_id, user_id)
        if not _is_markdown_filename(uf.original_filename):
            raise AppError(
                code="NOT_MARKDOWN",
                message="This file is not a Markdown document",
                status_code=400,
            )

        try:
            base_dt = datetime.fromisoformat(base_updated_at)
        except (ValueError, TypeError):
            raise AppError(
                code="INVALID_TIMESTAMP",
                message="Invalid base_updated_at format",
                status_code=400,
            )
        # Compare as naive UTC truncated to milliseconds to avoid
        # tz-info and microsecond-precision mismatch across DB engines.
        current_dt = uf.updated_at.replace(tzinfo=None) if uf.updated_at.tzinfo else uf.updated_at
        base_dt = base_dt.replace(tzinfo=None) if base_dt.tzinfo else base_dt
        current_dt = current_dt.replace(microsecond=current_dt.microsecond // 1000 * 1000)
        base_dt = base_dt.replace(microsecond=base_dt.microsecond // 1000 * 1000)
        if base_dt != current_dt:
            raise AppError(
                code="CONTENT_CONFLICT",
                message="This file was changed elsewhere",
                status_code=409,
            )

        data = content.encode("utf-8")
        if len(data) > _MARKDOWN_MAX_BYTES:
            raise AppError(
                code="CONTENT_TOO_LARGE",
                message="Content exceeds 1 MB limit",
                status_code=413,
            )

        size_delta = len(data) - uf.size
        if size_delta > 0 and uf.user_id is not None:
            await self._check_quota(uf.user_id, additional_bytes=size_delta, additional_count=0)

        uf.size = await asyncio.to_thread(self._fs.overwrite_bytes, uf.file_id, data)
        uf.updated_at = utcnow()
        await self._db.flush()

        await self._gc_editor_images(file_id, content, uf.expires_at)

        return uf

    # ── Editor images ────────────────────────────────────────────────

    async def upload_editor_image(
        self,
        doc_id: int,
        user_id: int,
        *,
        filename: str,
        data: bytes,
        content_type: str,
    ) -> tuple[str, str]:
        """Upload an image for a markdown document. Returns (file_id, url)."""
        parent = await self.get_file(doc_id, user_id)
        if not _is_markdown_filename(parent.original_filename):
            raise AppError(
                code="NOT_MARKDOWN",
                message="Parent file is not a Markdown document",
                status_code=400,
            )

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
            # Unlimited parent — pending image expires in 24h as safety net
            expires = utcnow() + timedelta(hours=24)
        else:
            expires = parent.expires_at

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

    async def _gc_editor_images(self, doc_id: int, content: str, parent_expires_at=None) -> None:
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

    async def _sync_editor_image_expiry(self, doc_id: int, new_expires_at) -> None:
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

    async def _cascade_delete_editor_images(self, doc_id: int) -> None:
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

    async def extend_file(self, file_id: int, user_id: int, days: int) -> UserFile:
        uf = await self.get_file(file_id, user_id)
        _, _, max_days = await self._get_user_limits(user_id)

        if max_days == 0:
            # Unlimited — just extend
            if uf.expires_at is None:
                return uf
            uf.expires_at = uf.expires_at + timedelta(days=days)
        else:
            max_expiry = utcnow() + timedelta(days=max_days)
            base = uf.expires_at or utcnow()
            new_expiry = base + timedelta(days=days)
            if new_expiry > max_expiry:
                raise AppError(
                    code="MAX_RETENTION_EXCEEDED",
                    message=f"Cannot extend beyond {max_days} days from now",
                    status_code=400,
                )
            uf.expires_at = new_expiry
        await self._db.flush()

        # Update share groups that include this file
        await self._refresh_share_group_expiry_for_file(uf.id)

        # Sync editor image expiration with parent doc
        await self._sync_editor_image_expiry(uf.id, uf.expires_at)

        return uf

    async def delete_files(self, ids: list[int], user_id: int) -> int:
        if not ids or len(ids) > 50:
            raise AppError(
                code="INVALID_IDS",
                message="Provide 1-50 file IDs",
                status_code=400,
            )

        result = await self._db.execute(
            select(UserFile).where(
                UserFile.id.in_(ids),
                UserFile.user_id == user_id,
                UserFile.status == FileStatus.ACTIVE,
            )
        )
        files = list(result.scalars().all())

        for uf in files:
            uf.status = FileStatus.DELETED
            try:
                self._fs.delete(uf.file_id)
            except Exception:
                logger.warning("Failed to delete physical file %s", uf.file_id, exc_info=True)
            if uf.thumb_file_id:
                try:
                    self._fs.delete(uf.thumb_file_id)
                except Exception:
                    logger.warning("Failed to delete thumbnail %s", uf.thumb_file_id, exc_info=True)
            await self._cascade_delete_editor_images(uf.id)

        if files:
            file_ids = [f.id for f in files]
            # Remove from share groups
            await self._db.execute(
                delete(ShareGroupFile).where(ShareGroupFile.user_file_id.in_(file_ids))
            )
            # Clean up empty share groups
            await self._cleanup_empty_share_groups(user_id)

        await self._db.flush()
        return len(files)

    # ── Share groups ─────────────────────────────────────────────────

    async def create_share_group(
        self,
        *,
        user_id: int,
        file_ids: list[int],
        use_extract_code: bool = False,
        message: str | None = None,
    ) -> ShareGroup:
        if not file_ids:
            raise AppError(code="EMPTY_FILES", message="No files specified", status_code=400)
        if len(file_ids) > settings.max_hub_share_files:
            raise AppError(
                code="TOO_MANY_FILES",
                message=f"Maximum {settings.max_hub_share_files} files per share",
                status_code=400,
            )

        result = await self._db.execute(
            select(UserFile).where(
                UserFile.id.in_(file_ids),
                UserFile.user_id == user_id,
                UserFile.status == FileStatus.ACTIVE,
            )
        )
        files = list(result.scalars().all())
        if len(files) != len(file_ids):
            raise AppError(
                code="FILES_NOT_FOUND",
                message="Some files not found or not owned by you",
                status_code=400,
            )

        expiries = [f.expires_at for f in files if f.expires_at is not None]
        earliest_expiry = min(expiries) if expiries else None

        sg = ShareGroup(
            user_id=user_id,
            token=_gen_token(),
            extract_code=_gen_code() if use_extract_code else None,
            message=(message or "")[:500] or None,
            expires_at=earliest_expiry,
        )
        self._db.add(sg)
        await self._db.flush()

        for uf in files:
            self._db.add(ShareGroupFile(share_group_id=sg.id, user_file_id=uf.id))
        await self._db.flush()

        return sg

    async def list_share_groups(
        self,
        user_id: int,
        *,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[dict], int]:
        base = select(ShareGroup).where(
            ShareGroup.user_id == user_id,
            ShareGroup.status == ShareGroupStatus.ACTIVE,
        )

        count_result = await self._db.execute(
            select(func.count()).select_from(base.subquery())
        )
        total = count_result.scalar_one()

        offset = (max(page, 1) - 1) * page_size
        rows = await self._db.execute(
            base.order_by(ShareGroup.created_at.desc())
            .offset(offset)
            .limit(min(page_size, 100))
        )
        groups = list(rows.scalars().all())

        # Batch-fetch stats to avoid N+1 queries
        stats_map: dict[int, tuple[int, int]] = {}
        sg_ids = [sg.id for sg in groups]
        if sg_ids:
            stats_result = await self._db.execute(
                select(
                    ShareGroupFile.share_group_id,
                    func.count(),
                    func.coalesce(func.sum(UserFile.size), 0),
                )
                .select_from(ShareGroupFile)
                .join(UserFile, ShareGroupFile.user_file_id == UserFile.id)
                .where(
                    ShareGroupFile.share_group_id.in_(sg_ids),
                    UserFile.status == FileStatus.ACTIVE,
                )
                .group_by(ShareGroupFile.share_group_id)
            )
            for row in stats_result.all():
                stats_map[row[0]] = (row[1], int(row[2]))

        items = []
        for sg in groups:
            file_count, total_size = stats_map.get(sg.id, (0, 0))
            items.append({
                "id": sg.id,
                "token": sg.token,
                "extract_code": sg.extract_code,
                "message": sg.message,
                "file_count": file_count,
                "total_size": total_size,
                "download_count": sg.download_count,
                "expires_at": sg.expires_at.isoformat() if sg.expires_at else None,
                "created_at": sg.created_at.isoformat(),
                "status": sg.status,
            })

        return items, total

    async def delete_share_group(self, share_id: int, user_id: int) -> None:
        result = await self._db.execute(
            select(ShareGroup).where(
                ShareGroup.id == share_id,
                ShareGroup.user_id == user_id,
            )
        )
        sg = result.scalar_one_or_none()
        if not sg:
            raise AppError(code="NOT_FOUND", message="Share group not found", status_code=404)

        sg.status = ShareGroupStatus.DELETED
        await self._db.execute(
            delete(ShareGroupFile).where(ShareGroupFile.share_group_id == sg.id)
        )
        await self._db.flush()

    async def add_files_to_share(
        self,
        share_id: int,
        user_id: int,
        file_ids: list[int],
    ) -> ShareGroup:
        """Add files to an existing share group. Returns updated ShareGroup."""
        if not file_ids:
            raise AppError(code="EMPTY_FILES", message="No files specified", status_code=400)

        result = await self._db.execute(
            select(ShareGroup).where(
                ShareGroup.id == share_id,
                ShareGroup.user_id == user_id,
                ShareGroup.status == ShareGroupStatus.ACTIVE,
            )
        )
        sg = result.scalar_one_or_none()
        if not sg:
            raise AppError(code="NOT_FOUND", message="Share group not found", status_code=404)

        # Count existing files
        existing_count_result = await self._db.execute(
            select(func.count()).where(ShareGroupFile.share_group_id == sg.id)
        )
        existing_count = existing_count_result.scalar_one()

        if existing_count + len(file_ids) > settings.max_hub_share_files:
            raise AppError(
                code="TOO_MANY_FILES",
                message=f"Maximum {settings.max_hub_share_files} files per share",
                status_code=400,
            )

        # Validate file ownership and status
        files_result = await self._db.execute(
            select(UserFile).where(
                UserFile.id.in_(file_ids),
                UserFile.user_id == user_id,
                UserFile.status == FileStatus.ACTIVE,
            )
        )
        files = list(files_result.scalars().all())
        if len(files) != len(file_ids):
            raise AppError(
                code="FILES_NOT_FOUND",
                message="Some files not found or not owned by you",
                status_code=400,
            )

        # Skip files already in the share group
        existing_result = await self._db.execute(
            select(ShareGroupFile.user_file_id).where(
                ShareGroupFile.share_group_id == sg.id,
                ShareGroupFile.user_file_id.in_(file_ids),
            )
        )
        existing_file_ids = {row[0] for row in existing_result.all()}
        new_files = [f for f in files if f.id not in existing_file_ids]

        for uf in new_files:
            self._db.add(ShareGroupFile(share_group_id=sg.id, user_file_id=uf.id))

        # Clear emptied_at since the group now has files
        if new_files:
            sg.emptied_at = None

        # Recalculate expiry
        await self._refresh_share_group_expiry(sg.id)
        await self._db.flush()
        return sg

    async def remove_files_from_share(
        self,
        share_id: int,
        user_id: int,
        file_ids: list[int],
    ) -> ShareGroup:
        """Remove files from a share group. Sets emptied_at if group becomes empty."""
        if not file_ids:
            raise AppError(code="EMPTY_FILES", message="No files specified", status_code=400)

        result = await self._db.execute(
            select(ShareGroup).where(
                ShareGroup.id == share_id,
                ShareGroup.user_id == user_id,
                ShareGroup.status == ShareGroupStatus.ACTIVE,
            )
        )
        sg = result.scalar_one_or_none()
        if not sg:
            raise AppError(code="NOT_FOUND", message="Share group not found", status_code=404)

        await self._db.execute(
            delete(ShareGroupFile).where(
                ShareGroupFile.share_group_id == sg.id,
                ShareGroupFile.user_file_id.in_(file_ids),
            )
        )

        # Check if the group is now empty
        remaining_result = await self._db.execute(
            select(func.count()).where(ShareGroupFile.share_group_id == sg.id)
        )
        remaining = remaining_result.scalar_one()
        if remaining == 0:
            sg.emptied_at = utcnow()
        else:
            sg.emptied_at = None

        # Recalculate expiry
        await self._refresh_share_group_expiry(sg.id)
        await self._db.flush()
        return sg

    # ── Public share access ──────────────────────────────────────────

    async def get_share_info(self, token: str, code: str | None = None) -> dict | None:
        """Return share info. Returns None if token invalid.
        Returns {"need_code": True} if code required but not provided/wrong.
        """
        result = await self._db.execute(
            select(ShareGroup).where(
                ShareGroup.token == token,
                ShareGroup.status == ShareGroupStatus.ACTIVE,
            )
        )
        sg = result.scalar_one_or_none()
        if not sg:
            return None

        # Check if expired
        if _is_expired_at(sg.expires_at):
            sg.status = ShareGroupStatus.EXPIRED
            await self._db.flush()
            return None

        if sg.extract_code:
            if sg.failed_code_attempts >= 10:
                raise AppError(
                    code="LOCKED",
                    message="Too many failed attempts",
                    status_code=423,
                )
            if not code:
                return {"has_extract_code": True, "need_code": True}
            if code != sg.extract_code:
                sg.failed_code_attempts += 1
                await self._db.flush()
                raise AppError(
                    code="WRONG_CODE",
                    message="Incorrect extract code",
                    status_code=403,
                )

        # Get files
        files_result = await self._db.execute(
            select(UserFile)
            .join(ShareGroupFile, ShareGroupFile.user_file_id == UserFile.id)
            .where(
                ShareGroupFile.share_group_id == sg.id,
                UserFile.status == FileStatus.ACTIVE,
            )
        )
        files = list(files_result.scalars().all())
        if not files:
            return None

        return {
            "token": sg.token,
            "message": sg.message,
            "file_count": len(files),
            "total_size": sum(f.size for f in files),
            "download_count": sg.download_count,
            "expires_at": sg.expires_at.isoformat() if sg.expires_at else None,
            "has_extract_code": sg.extract_code is not None,
            "status": sg.status,
            "created_at": sg.created_at.isoformat(),
            "files": [
                {
                    "id": f.id,
                    "file_name": f.original_filename,
                    "size": f.size,
                    "content_type": f.content_type,
                }
                for f in files
            ],
        }

    async def get_share_og_meta(self, token: str) -> dict | None:
        """Return minimal share info for OG tags (no auth/code check)."""
        result = await self._db.execute(
            select(ShareGroup).where(ShareGroup.token == token)
        )
        sg = result.scalar_one_or_none()
        if not sg:
            return None

        files_result = await self._db.execute(
            select(UserFile.original_filename)
            .join(ShareGroupFile, ShareGroupFile.user_file_id == UserFile.id)
            .where(ShareGroupFile.share_group_id == sg.id)
        )
        file_names = [row[0] for row in files_result.all()]

        return {
            "message": sg.message,
            "file_count": len(file_names),
            "file_names": file_names,
            "has_extract_code": sg.extract_code is not None,
        }

    async def get_share_markdown_content(
        self,
        token: str,
        file_id: int,
        code: str | None = None,
    ) -> str:
        result = await self._db.execute(
            select(ShareGroup).where(
                ShareGroup.token == token,
                ShareGroup.status == ShareGroupStatus.ACTIVE,
            )
        )
        sg = result.scalar_one_or_none()
        if not sg or _is_expired_at(sg.expires_at):
            raise AppError(code="NOT_FOUND", message="File not found", status_code=404)

        if sg.extract_code:
            if sg.failed_code_attempts >= 10:
                raise AppError(code="LOCKED", message="Too many failed attempts", status_code=423)
            if not code:
                raise AppError(code="CODE_REQUIRED", message="Extract code required", status_code=403)
            if code != sg.extract_code:
                sg.failed_code_attempts += 1
                await self._db.flush()
                raise AppError(code="WRONG_CODE", message="Incorrect extract code", status_code=403)

        file_result = await self._db.execute(
            select(UserFile)
            .join(ShareGroupFile, ShareGroupFile.user_file_id == UserFile.id)
            .where(
                ShareGroupFile.share_group_id == sg.id,
                UserFile.id == file_id,
                UserFile.status == FileStatus.ACTIVE,
            )
        )
        uf = file_result.scalar_one_or_none()
        if not uf:
            raise AppError(code="NOT_FOUND", message="File not found", status_code=404)
        if not _is_markdown_filename(uf.original_filename):
            raise AppError(
                code="NOT_MARKDOWN",
                message="This file is not a Markdown document",
                status_code=400,
            )
        try:
            raw = await asyncio.to_thread(self._fs.get_path(uf.file_id).read_bytes)
            return raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise AppError(
                code="INVALID_CONTENT",
                message="This file cannot be displayed as Markdown",
                status_code=422,
            ) from exc

    async def get_share_file(self, token: str, file_id: int, code: str | None = None) -> UserFile | None:
        """Get a file from a share group for download. Validates token and code."""
        result = await self._db.execute(
            select(ShareGroup).where(
                ShareGroup.token == token,
                ShareGroup.status == ShareGroupStatus.ACTIVE,
            )
        )
        sg = result.scalar_one_or_none()
        if not sg or _is_expired_at(sg.expires_at):
            return None

        if sg.extract_code:
            if sg.failed_code_attempts >= 10:
                raise AppError(code="LOCKED", message="Too many failed attempts", status_code=423)
            if not code:
                raise AppError(code="CODE_REQUIRED", message="Extract code required", status_code=403)
            if code != sg.extract_code:
                sg.failed_code_attempts += 1
                await self._db.flush()
                raise AppError(code="WRONG_CODE", message="Incorrect extract code", status_code=403)

        file_result = await self._db.execute(
            select(UserFile)
            .join(ShareGroupFile, ShareGroupFile.user_file_id == UserFile.id)
            .where(
                ShareGroupFile.share_group_id == sg.id,
                UserFile.id == file_id,
                UserFile.status == FileStatus.ACTIVE,
            )
        )
        uf = file_result.scalar_one_or_none()
        if not uf:
            return None

        # Increment download count
        sg.download_count += 1
        await self._db.flush()
        return uf

    async def get_share_files_for_zip(self, token: str, code: str | None = None) -> list[UserFile]:
        """Get all files from a share group for zip download."""
        result = await self._db.execute(
            select(ShareGroup).where(
                ShareGroup.token == token,
                ShareGroup.status == ShareGroupStatus.ACTIVE,
            )
        )
        sg = result.scalar_one_or_none()
        if not sg or _is_expired_at(sg.expires_at):
            raise AppError(code="NOT_FOUND", message="Share not found", status_code=404)

        if sg.extract_code:
            if sg.failed_code_attempts >= 10:
                raise AppError(code="LOCKED", message="Too many failed attempts", status_code=423)
            if not code:
                raise AppError(code="CODE_REQUIRED", message="Extract code required", status_code=403)
            if code != sg.extract_code:
                sg.failed_code_attempts += 1
                await self._db.flush()
                raise AppError(code="WRONG_CODE", message="Incorrect extract code", status_code=403)

        files_result = await self._db.execute(
            select(UserFile)
            .join(ShareGroupFile, ShareGroupFile.user_file_id == UserFile.id)
            .where(
                ShareGroupFile.share_group_id == sg.id,
                UserFile.status == FileStatus.ACTIVE,
            )
        )
        files = list(files_result.scalars().all())
        if not files:
            raise AppError(code="NOT_FOUND", message="No files available", status_code=404)

        sg.download_count += 1
        await self._db.flush()
        return files

    # ── Expiration ───────────────────────────────────────────────────

    async def expire_files(self) -> int:
        """Expire files past their expiry. Returns count of expired files."""
        now = utcnow()
        result = await self._db.execute(
            select(UserFile).where(
                UserFile.expires_at < now,
                UserFile.status.in_([FileStatus.ACTIVE, FileStatus.PENDING]),
            )
        )
        files = list(result.scalars().all())
        if not files:
            return 0

        expired_ids = []
        for uf in files:
            uf.status = FileStatus.EXPIRED
            try:
                self._fs.delete(uf.file_id)
            except Exception:
                logger.warning("Failed to delete expired file %s", uf.file_id, exc_info=True)
            if uf.thumb_file_id:
                try:
                    self._fs.delete(uf.thumb_file_id)
                except Exception:
                    logger.warning("Failed to delete expired thumbnail %s", uf.thumb_file_id, exc_info=True)
            expired_ids.append(uf.id)

        # Remove from share groups
        if expired_ids:
            await self._db.execute(
                delete(ShareGroupFile).where(ShareGroupFile.user_file_id.in_(expired_ids))
            )

        # Mark newly-empty share groups with emptied_at
        await self._expire_empty_share_groups()
        # Delete share groups that have been empty for 7+ days
        stale = await self._delete_stale_empty_share_groups()
        if stale:
            logger.info("Deleted %d stale empty share groups", stale)
        # Expire share groups past their expiry
        await self._db.execute(
            update(ShareGroup)
            .where(ShareGroup.expires_at < now, ShareGroup.status == ShareGroupStatus.ACTIVE)
            .values(status=ShareGroupStatus.EXPIRED)
        )

        await self._db.commit()
        logger.info("Expired %d hub files", len(files))
        return len(files)

    def get_file_path(self, storage_file_id: str) -> Path:
        """Return the on-disk path for a storage UUID."""
        return self._fs.get_path(storage_file_id)

    # ── Lookup by storage file_id ────────────────────────────────────

    async def get_by_file_id(self, file_id: str) -> UserFile | None:
        """Look up a UserFile by its FileService storage UUID."""
        result = await self._db.execute(
            select(UserFile).where(
                UserFile.file_id == file_id,
                UserFile.status == FileStatus.ACTIVE,
            )
        )
        return result.scalar_one_or_none()

    # ── Internal helpers ─────────────────────────────────────────────

    async def _share_group_stats(self, group_id: int) -> tuple[int, int]:
        result = await self._db.execute(
            select(func.count(), func.coalesce(func.sum(UserFile.size), 0))
            .select_from(ShareGroupFile)
            .join(UserFile, ShareGroupFile.user_file_id == UserFile.id)
            .where(
                ShareGroupFile.share_group_id == group_id,
                UserFile.status == FileStatus.ACTIVE,
            )
        )
        return result.one()

    async def _cleanup_empty_share_groups(self, user_id: int) -> None:
        """Mark newly-empty share groups with emptied_at (instead of deleting)."""
        subq = (
            select(ShareGroup.id)
            .outerjoin(ShareGroupFile, ShareGroupFile.share_group_id == ShareGroup.id)
            .where(
                ShareGroup.user_id == user_id,
                ShareGroup.status == ShareGroupStatus.ACTIVE,
                ShareGroup.emptied_at.is_(None),
            )
            .group_by(ShareGroup.id)
            .having(func.count(ShareGroupFile.id) == 0)
        )
        result = await self._db.execute(subq)
        empty_ids = [row[0] for row in result.all()]
        if empty_ids:
            await self._db.execute(
                update(ShareGroup)
                .where(ShareGroup.id.in_(empty_ids))
                .values(emptied_at=utcnow())
            )

    async def _expire_empty_share_groups(self) -> None:
        """Mark newly-empty share groups with emptied_at (instead of expiring)."""
        subq = (
            select(ShareGroup.id)
            .outerjoin(ShareGroupFile, ShareGroupFile.share_group_id == ShareGroup.id)
            .where(
                ShareGroup.status == ShareGroupStatus.ACTIVE,
                ShareGroup.emptied_at.is_(None),
            )
            .group_by(ShareGroup.id)
            .having(func.count(ShareGroupFile.id) == 0)
        )
        result = await self._db.execute(subq)
        empty_ids = [row[0] for row in result.all()]
        if empty_ids:
            await self._db.execute(
                update(ShareGroup)
                .where(ShareGroup.id.in_(empty_ids))
                .values(emptied_at=utcnow())
            )

    async def _delete_stale_empty_share_groups(self) -> int:
        """Delete share groups that have been empty for more than 7 days."""
        cutoff = utcnow() - timedelta(days=7)
        result = await self._db.execute(
            update(ShareGroup)
            .where(
                ShareGroup.status == ShareGroupStatus.ACTIVE,
                ShareGroup.emptied_at.isnot(None),
                ShareGroup.emptied_at < cutoff,
            )
            .values(status=ShareGroupStatus.DELETED)
        )
        return result.rowcount  # type: ignore[return-value]

    async def _refresh_share_group_expiry(self, sg_id: int) -> None:
        """Recalculate expires_at for a single share group."""
        min_result = await self._db.execute(
            select(func.min(UserFile.expires_at))
            .select_from(ShareGroupFile)
            .join(UserFile, ShareGroupFile.user_file_id == UserFile.id)
            .where(
                ShareGroupFile.share_group_id == sg_id,
                UserFile.status == FileStatus.ACTIVE,
            )
        )
        min_exp = min_result.scalar_one()
        await self._db.execute(
            update(ShareGroup)
            .where(ShareGroup.id == sg_id)
            .values(expires_at=min_exp)
        )

    async def _refresh_share_group_expiry_for_file(self, user_file_id: int) -> None:
        """Update expires_at of all share groups containing this file."""
        sg_ids_result = await self._db.execute(
            select(ShareGroupFile.share_group_id).where(
                ShareGroupFile.user_file_id == user_file_id
            )
        )
        sg_ids = [row[0] for row in sg_ids_result.all()]
        for sg_id in sg_ids:
            await self._refresh_share_group_expiry(sg_id)


def share_count_query(user_file_id: int):
    """Return a SELECT query for the number of active share groups containing this file."""
    return (
        select(func.count())
        .select_from(ShareGroupFile)
        .join(ShareGroup, ShareGroupFile.share_group_id == ShareGroup.id)
        .where(
            ShareGroupFile.user_file_id == user_file_id,
            ShareGroup.status == ShareGroupStatus.ACTIVE,
        )
    )
