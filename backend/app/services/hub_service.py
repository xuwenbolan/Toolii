from __future__ import annotations

import json
import logging
import secrets
import string
from datetime import timedelta
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import AppError
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


def _gen_token(length: int = 8) -> str:
    return "".join(secrets.choice(_TOKEN_CHARS) for _ in range(length))


def _gen_code(length: int = 6) -> str:
    return "".join(secrets.choice(_CODE_CHARS) for _ in range(length))


class HubService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._fs = FileService()

    # ── Quota helpers ────────────────────────────────────────────────

    async def _check_quota(self, user_id: int, additional_bytes: int = 0, additional_count: int = 0) -> None:
        result = await self._db.execute(
            select(
                func.coalesce(func.sum(UserFile.size), 0),
                func.count(),
            ).where(
                UserFile.user_id == user_id,
                UserFile.status == FileStatus.ACTIVE,
            )
        )
        used_bytes, file_count = result.one()

        max_bytes = settings.max_hub_total_mb * 1024 * 1024
        if used_bytes + additional_bytes > max_bytes:
            raise AppError(
                code="QUOTA_EXCEEDED",
                message="Storage quota exceeded",
                status_code=413,
            )
        if file_count + additional_count > settings.max_hub_files:
            raise AppError(
                code="FILE_LIMIT_EXCEEDED",
                message=f"Maximum {settings.max_hub_files} files allowed",
                status_code=413,
            )

    async def get_usage(self, user_id: int) -> tuple[int, int]:
        """Return (used_bytes, quota_bytes) for a user."""
        result = await self._db.execute(
            select(func.coalesce(func.sum(UserFile.size), 0)).where(
                UserFile.user_id == user_id,
                UserFile.status == FileStatus.ACTIVE,
            )
        )
        used = result.scalar_one()
        return used, settings.max_hub_total_mb * 1024 * 1024

    # ── Save files ───────────────────────────────────────────────────

    async def save_upload(
        self,
        *,
        user_id: int,
        data: bytes,
        filename: str,
        content_type: str,
        retention_days: int = 3,
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
        days = min(max(retention_days, 1), 7)

        uf = UserFile(
            user_id=user_id,
            file_id=stored.file_id,
            original_filename=safe_filename(filename),
            size=stored.size,
            content_type=content_type,
            source=FileSource.UPLOAD,
            expires_at=utcnow() + timedelta(days=days),
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

        uf = UserFile(
            user_id=user_id,
            file_id=file_id,
            original_filename=safe_filename(filename),
            size=size,
            content_type=content_type,
            source=FileSource.TOOL_RESULT,
            expires_at=utcnow() + ttl,
            meta=json.dumps(meta) if meta else None,
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

    async def rename_file(self, file_id: int, user_id: int, new_name: str) -> UserFile:
        uf = await self.get_file(file_id, user_id)
        uf.original_filename = safe_filename(new_name)
        await self._db.flush()
        return uf

    async def extend_file(self, file_id: int, user_id: int, days: int) -> UserFile:
        uf = await self.get_file(file_id, user_id)
        max_expiry = utcnow() + timedelta(days=7)
        new_expiry = uf.expires_at + timedelta(days=days)
        if new_expiry > max_expiry:
            raise AppError(
                code="MAX_RETENTION_EXCEEDED",
                message="Cannot extend beyond 7 days from now",
                status_code=400,
            )
        uf.expires_at = new_expiry
        await self._db.flush()

        # Update share groups that include this file
        await self._refresh_share_group_expiry_for_file(uf.id)

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
            self._fs.delete(uf.file_id)

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

        earliest_expiry = min(f.expires_at for f in files)

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

        items = []
        for sg in groups:
            file_count, total_size = await self._share_group_stats(sg.id)
            items.append({
                "id": sg.id,
                "token": sg.token,
                "extract_code": sg.extract_code,
                "message": sg.message,
                "file_count": file_count,
                "total_size": total_size,
                "download_count": sg.download_count,
                "expires_at": sg.expires_at.isoformat(),
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
        if sg.expires_at < utcnow():
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
            "expires_at": sg.expires_at.isoformat(),
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

    async def get_share_file(self, token: str, file_id: int, code: str | None = None) -> UserFile | None:
        """Get a file from a share group for download. Validates token and code."""
        result = await self._db.execute(
            select(ShareGroup).where(
                ShareGroup.token == token,
                ShareGroup.status == ShareGroupStatus.ACTIVE,
            )
        )
        sg = result.scalar_one_or_none()
        if not sg or sg.expires_at < utcnow():
            return None

        if sg.extract_code:
            if sg.failed_code_attempts >= 10:
                raise AppError(code="LOCKED", message="Too many failed attempts", status_code=423)
            if not code or code != sg.extract_code:
                raise AppError(code="CODE_REQUIRED", message="Extract code required", status_code=403)

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
        if not sg or sg.expires_at < utcnow():
            raise AppError(code="NOT_FOUND", message="Share not found", status_code=404)

        if sg.extract_code:
            if sg.failed_code_attempts >= 10:
                raise AppError(code="LOCKED", message="Too many failed attempts", status_code=423)
            if not code or code != sg.extract_code:
                raise AppError(code="CODE_REQUIRED", message="Extract code required", status_code=403)

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
                UserFile.status == FileStatus.ACTIVE,
            )
        )
        files = list(result.scalars().all())
        if not files:
            return 0

        expired_ids = []
        for uf in files:
            uf.status = FileStatus.EXPIRED
            self._fs.delete(uf.file_id)
            expired_ids.append(uf.id)

        # Remove from share groups
        if expired_ids:
            await self._db.execute(
                delete(ShareGroupFile).where(ShareGroupFile.user_file_id.in_(expired_ids))
            )

        # Expire empty share groups
        await self._expire_empty_share_groups()
        # Expire share groups past their expiry
        await self._db.execute(
            update(ShareGroup)
            .where(ShareGroup.expires_at < now, ShareGroup.status == ShareGroupStatus.ACTIVE)
            .values(status=ShareGroupStatus.EXPIRED)
        )

        await self._db.commit()
        logger.info("Expired %d hub files", len(files))
        return len(files)

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
        subq = (
            select(ShareGroup.id)
            .outerjoin(ShareGroupFile, ShareGroupFile.share_group_id == ShareGroup.id)
            .where(
                ShareGroup.user_id == user_id,
                ShareGroup.status == ShareGroupStatus.ACTIVE,
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
                .values(status=ShareGroupStatus.DELETED)
            )

    async def _expire_empty_share_groups(self) -> None:
        subq = (
            select(ShareGroup.id)
            .outerjoin(ShareGroupFile, ShareGroupFile.share_group_id == ShareGroup.id)
            .where(ShareGroup.status == ShareGroupStatus.ACTIVE)
            .group_by(ShareGroup.id)
            .having(func.count(ShareGroupFile.id) == 0)
        )
        result = await self._db.execute(subq)
        empty_ids = [row[0] for row in result.all()]
        if empty_ids:
            await self._db.execute(
                update(ShareGroup)
                .where(ShareGroup.id.in_(empty_ids))
                .values(status=ShareGroupStatus.EXPIRED)
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
            if min_exp:
                await self._db.execute(
                    update(ShareGroup)
                    .where(ShareGroup.id == sg_id)
                    .values(expires_at=min_exp)
                )


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
