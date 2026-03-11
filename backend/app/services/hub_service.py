from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import AppError
from app.core.pagination import paginate
from app.models.user import User
from app.models.user_file import (
    FileSource,
    FileStatus,
    UserFile,
)
from app.services.file_service import FileService, safe_filename
from app.services.hub_share_service import HubShareService, share_count_query
from app.services.hub_upload_service import (
    ALLOWED_IMAGE_TYPES,
    HubUploadService,
    _is_markdown_filename,
)
from app.utils.time_utils import utcnow

logger = logging.getLogger(__name__)

_MARKDOWN_MAX_BYTES = 1024 * 1024

# Re-export for external consumers
__all__ = ["ALLOWED_IMAGE_TYPES", "HubService", "share_count_query"]


class HubService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._fs = FileService()
        self._upload = HubUploadService(db, self._fs, self._check_quota)
        self._share = HubShareService(db, self._fs)

    # -- Per-user limits --

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

    # -- Quota helpers --

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

    # -- Upload delegation --

    async def save_upload(
        self,
        *,
        user_id: int,
        data: bytes,
        filename: str,
        content_type: str,
        retention_days: int = 7,
    ) -> UserFile:
        _, _, max_days = await self._get_user_limits(user_id)
        return await self._upload.save_upload(
            user_id=user_id,
            data=data,
            filename=filename,
            content_type=content_type,
            retention_days=retention_days,
            max_days=max_days,
        )

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
        return await self._upload.save_tool_result(
            user_id=user_id,
            file_id=file_id,
            filename=filename,
            content_type=content_type,
            size=size,
            meta=meta,
        )

    async def upload_editor_image(
        self,
        doc_id: int,
        user_id: int,
        *,
        filename: str,
        data: bytes,
        content_type: str,
    ) -> tuple[str, str]:
        parent = await self.get_file(doc_id, user_id)
        if not _is_markdown_filename(parent.original_filename):
            raise AppError(
                code="NOT_MARKDOWN",
                message="Parent file is not a Markdown document",
                status_code=400,
            )
        return await self._upload.upload_editor_image(
            doc_id, user_id,
            parent=parent,
            filename=filename,
            data=data,
            content_type=content_type,
        )

    async def get_editor_image(self, storage_file_id: str) -> tuple[Path, str]:
        return await self._upload.get_editor_image(storage_file_id)

    # -- File management --

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

        limit = min(page_size, 100)
        offset = (max(page, 1) - 1) * page_size
        items, total = await paginate(
            self._db,
            base,
            order_by=UserFile.created_at.desc(),
            limit=limit,
            offset=offset,
        )
        return list(items), total

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

        await self._upload.gc_editor_images(file_id, content, uf.expires_at)

        return uf

    async def extend_file(self, file_id: int, user_id: int, days: int) -> UserFile:
        uf = await self.get_file(file_id, user_id)
        _, _, max_days = await self._get_user_limits(user_id)

        if max_days == 0:
            # Unlimited -- just extend
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
        await self._share.refresh_share_group_expiry_for_file(uf.id)

        # Sync editor image expiration with parent doc
        await self._upload.sync_editor_image_expiry(uf.id, uf.expires_at)

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
            except OSError:
                logger.warning("Failed to delete physical file %s", uf.file_id, exc_info=True)
            if uf.thumb_file_id:
                try:
                    self._fs.delete(uf.thumb_file_id)
                except OSError:
                    logger.warning("Failed to delete thumbnail %s", uf.thumb_file_id, exc_info=True)
            await self._upload.cascade_delete_editor_images(uf.id)

        if files:
            file_ids = [f.id for f in files]
            # Remove from share groups
            await self._share.remove_files_from_groups(file_ids)
            # Clean up empty share groups
            await self._share.cleanup_empty_share_groups(user_id)

        await self._db.flush()
        return len(files)

    # -- Share group delegation --

    async def create_share_group(self, **kwargs) -> Any:
        return await self._share.create_share_group(**kwargs)

    async def list_share_groups(self, user_id: int, **kwargs) -> tuple[list[dict], int]:
        return await self._share.list_share_groups(user_id, **kwargs)

    async def delete_share_group(self, share_id: int, user_id: int) -> None:
        return await self._share.delete_share_group(share_id, user_id)

    async def add_files_to_share(self, share_id: int, user_id: int, file_ids: list[int]) -> Any:
        return await self._share.add_files_to_share(share_id, user_id, file_ids)

    async def remove_files_from_share(self, share_id: int, user_id: int, file_ids: list[int]) -> Any:
        return await self._share.remove_files_from_share(share_id, user_id, file_ids)

    async def get_share_info(self, token: str, code: str | None = None) -> dict | None:
        return await self._share.get_share_info(token, code)

    async def get_share_og_meta(self, token: str) -> dict | None:
        return await self._share.get_share_og_meta(token)

    async def get_share_markdown_content(self, token: str, file_id: int, code: str | None = None) -> str:
        return await self._share.get_share_markdown_content(token, file_id, code)

    async def get_share_file(self, token: str, file_id: int, code: str | None = None) -> UserFile | None:
        return await self._share.get_share_file(token, file_id, code)

    async def get_share_files_for_zip(self, token: str, code: str | None = None) -> list[UserFile]:
        return await self._share.get_share_files_for_zip(token, code)

    async def _share_group_stats(self, group_id: int) -> tuple[int, int]:
        return await self._share.share_group_stats(group_id)

    # -- Expiration --

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
            except OSError:
                logger.warning("Failed to delete expired file %s", uf.file_id, exc_info=True)
            if uf.thumb_file_id:
                try:
                    self._fs.delete(uf.thumb_file_id)
                except OSError:
                    logger.warning("Failed to delete expired thumbnail %s", uf.thumb_file_id, exc_info=True)
            expired_ids.append(uf.id)

        # Remove from share groups
        if expired_ids:
            await self._share.remove_files_from_groups(expired_ids)

        # Mark newly-empty share groups with emptied_at
        await self._share.expire_empty_share_groups()
        # Delete share groups that have been empty for 7+ days
        stale = await self._share.delete_stale_empty_share_groups()
        if stale:
            logger.info("Deleted %d stale empty share groups", stale)
        # Expire share groups past their expiry
        await self._share.expire_share_groups()

        await self._db.commit()
        logger.info("Expired %d hub files", len(files))
        return len(files)

    def get_file_path(self, storage_file_id: str) -> Path:
        """Return the on-disk path for a storage UUID."""
        return self._fs.get_path(storage_file_id)

    # -- Lookup by storage file_id --

    async def get_by_file_id(self, file_id: str) -> UserFile | None:
        """Look up a UserFile by its FileService storage UUID."""
        result = await self._db.execute(
            select(UserFile).where(
                UserFile.file_id == file_id,
                UserFile.status == FileStatus.ACTIVE,
            )
        )
        return result.scalar_one_or_none()
