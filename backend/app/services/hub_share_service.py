from __future__ import annotations

import asyncio
import logging
import secrets
import string
from datetime import timedelta
from pathlib import Path

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import AppError
from app.core.pagination import paginate
from app.models.user_file import (
    FileStatus,
    ShareGroup,
    ShareGroupFile,
    ShareGroupStatus,
    UserFile,
)
from app.services.file_service import FileService
from app.utils.time_utils import utcnow

logger = logging.getLogger(__name__)

_TOKEN_CHARS = string.ascii_letters + string.digits
_CODE_CHARS = string.ascii_lowercase + string.digits


def _gen_token(length: int = 8) -> str:
    return "".join(secrets.choice(_TOKEN_CHARS) for _ in range(length))


def _gen_code(length: int = 6) -> str:
    return "".join(secrets.choice(_CODE_CHARS) for _ in range(length))


def _is_expired_at(value) -> bool:
    if value is None:
        return False
    now = utcnow()
    if value.tzinfo is None:
        return value < now.replace(tzinfo=None)
    return value < now


def _is_markdown_filename(filename: str) -> bool:
    return filename.lower().endswith(".md")


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


class HubShareService:
    """Handles share group management, share link creation, and share file operations."""

    def __init__(self, db: AsyncSession, fs: FileService) -> None:
        self._db = db
        self._fs = fs

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

        limit = min(page_size, 100)
        offset = (max(page, 1) - 1) * page_size
        groups, total = await paginate(
            self._db,
            base,
            order_by=ShareGroup.created_at.desc(),
            limit=limit,
            offset=offset,
        )

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

    # -- Public share access --

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

    async def share_group_stats(self, group_id: int) -> tuple[int, int]:
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

    # -- Internal helpers --

    async def cleanup_empty_share_groups(self, user_id: int) -> None:
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

    async def expire_empty_share_groups(self) -> None:
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

    async def delete_stale_empty_share_groups(self) -> int:
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

    async def refresh_share_group_expiry_for_file(self, user_file_id: int) -> None:
        """Update expires_at of all share groups containing this file."""
        sg_ids_result = await self._db.execute(
            select(ShareGroupFile.share_group_id).where(
                ShareGroupFile.user_file_id == user_file_id
            )
        )
        sg_ids = [row[0] for row in sg_ids_result.all()]
        for sg_id in sg_ids:
            await self._refresh_share_group_expiry(sg_id)

    async def remove_files_from_groups(self, file_ids: list[int]) -> None:
        """Remove files from all share groups they belong to."""
        await self._db.execute(
            delete(ShareGroupFile).where(ShareGroupFile.user_file_id.in_(file_ids))
        )

    async def expire_share_groups(self) -> None:
        """Expire share groups past their expiry date."""
        now = utcnow()
        await self._db.execute(
            update(ShareGroup)
            .where(ShareGroup.expires_at < now, ShareGroup.status == ShareGroupStatus.ACTIVE)
            .values(status=ShareGroupStatus.EXPIRED)
        )
