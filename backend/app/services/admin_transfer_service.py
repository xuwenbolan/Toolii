from __future__ import annotations

import logging

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.result_share import ResultShare
from app.models.user import User
from app.models.user_file import FileStatus, ShareGroup, ShareGroupFile, ShareGroupStatus, UserFile
from app.services.file_service import FileService
from app.utils.time_utils import utcnow

logger = logging.getLogger(__name__)


class AdminTransferService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_hub_files(
        self,
        *,
        limit: int = 20,
        offset: int = 0,
        status: str | None = None,
        source: str | None = None,
    ) -> dict:
        base = select(UserFile)
        count_base = select(func.count()).select_from(UserFile)

        if status:
            base = base.where(UserFile.status == status)
            count_base = count_base.where(UserFile.status == status)
        if source:
            base = base.where(UserFile.source == source)
            count_base = count_base.where(UserFile.source == source)

        total = int((await self._db.execute(count_base)).scalar_one())
        files = (await self._db.execute(
            base.order_by(UserFile.id.desc()).limit(limit).offset(offset)
        )).scalars().all()

        user_ids = list({f.user_id for f in files if f.user_id})
        emails: dict[int, str] = {}
        if user_ids:
            rows = (await self._db.execute(
                select(User.id, User.email).where(User.id.in_(user_ids))
            )).all()
            emails = {r[0]: r[1] for r in rows}

        items = [
            {
                "id": f.id,
                "user_id": f.user_id,
                "user_email": emails.get(f.user_id) if f.user_id else None,
                "file_name": f.original_filename,
                "size": f.size,
                "content_type": f.content_type,
                "source": f.source,
                "status": f.status,
                "expires_at": f.expires_at,
                "created_at": f.created_at,
            }
            for f in files
        ]
        return {"items": items, "total": total, "limit": limit, "offset": offset}

    async def delete_hub_file(self, file_id: int) -> None:
        result = await self._db.execute(
            select(UserFile).where(UserFile.id == file_id)
        )
        uf = result.scalar_one_or_none()
        if uf is None:
            raise NotFoundError("File not found")

        fs = FileService()
        fs.delete(uf.file_id)
        uf.status = FileStatus.DELETED
        await self._db.execute(
            delete(ShareGroupFile).where(ShareGroupFile.user_file_id == uf.id)
        )
        await self._db.commit()

    async def list_share_groups(
        self,
        *,
        limit: int = 20,
        offset: int = 0,
        status: str | None = None,
    ) -> dict:
        base = select(ShareGroup)
        count_base = select(func.count()).select_from(ShareGroup)

        if status:
            base = base.where(ShareGroup.status == status)
            count_base = count_base.where(ShareGroup.status == status)

        total = int((await self._db.execute(count_base)).scalar_one())
        groups = (await self._db.execute(
            base.order_by(ShareGroup.id.desc()).limit(limit).offset(offset)
        )).scalars().all()

        user_ids = list({sg.user_id for sg in groups})
        emails: dict[int, str] = {}
        if user_ids:
            rows = (await self._db.execute(
                select(User.id, User.email).where(User.id.in_(user_ids))
            )).all()
            emails = {r[0]: r[1] for r in rows}

        # Compute file_count and total_size per group
        group_ids = [sg.id for sg in groups]
        stats: dict[int, tuple[int, int]] = {}
        if group_ids:
            stats_rows = (await self._db.execute(
                select(
                    ShareGroupFile.share_group_id,
                    func.count().label("fc"),
                    func.coalesce(func.sum(UserFile.size), 0).label("ts"),
                )
                .join(UserFile, ShareGroupFile.user_file_id == UserFile.id)
                .where(ShareGroupFile.share_group_id.in_(group_ids))
                .group_by(ShareGroupFile.share_group_id)
            )).all()
            stats = {r[0]: (r[1], int(r[2])) for r in stats_rows}

        items = [
            {
                "id": sg.id,
                "token": sg.token,
                "user_id": sg.user_id,
                "user_email": emails.get(sg.user_id),
                "file_count": stats.get(sg.id, (0, 0))[0],
                "total_size": stats.get(sg.id, (0, 0))[1],
                "download_count": sg.download_count,
                "has_extract_code": sg.extract_code is not None,
                "message": sg.message,
                "status": sg.status,
                "expires_at": sg.expires_at,
                "created_at": sg.created_at,
            }
            for sg in groups
        ]
        return {"items": items, "total": total, "limit": limit, "offset": offset}

    async def delete_share_group(self, group_id: int) -> None:
        result = await self._db.execute(
            select(ShareGroup).where(ShareGroup.id == group_id)
        )
        sg = result.scalar_one_or_none()
        if sg is None:
            raise NotFoundError("Share group not found")
        sg.status = ShareGroupStatus.DELETED
        await self._db.execute(
            delete(ShareGroupFile).where(ShareGroupFile.share_group_id == sg.id)
        )
        await self._db.commit()

    async def list_result_shares(
        self,
        *,
        limit: int = 20,
        offset: int = 0,
        share_type: str | None = None,
        expired: bool | None = None,
    ) -> dict:
        now = utcnow()
        base = select(ResultShare)
        count_base = select(func.count()).select_from(ResultShare)

        if share_type:
            base = base.where(ResultShare.share_type == share_type)
            count_base = count_base.where(ResultShare.share_type == share_type)
        if expired is True:
            base = base.where(ResultShare.expires_at <= now)
            count_base = count_base.where(ResultShare.expires_at <= now)
        elif expired is False:
            base = base.where(ResultShare.expires_at > now)
            count_base = count_base.where(ResultShare.expires_at > now)

        total = int((await self._db.execute(count_base)).scalar_one())
        shares = (await self._db.execute(
            base.order_by(ResultShare.id.desc()).limit(limit).offset(offset)
        )).scalars().all()

        # Batch-load user emails
        user_ids = [s.user_id for s in shares if s.user_id is not None]
        emails: dict[int, str] = {}
        if user_ids:
            rows = (await self._db.execute(
                select(User.id, User.email).where(User.id.in_(user_ids))
            )).all()
            emails = {r[0]: r[1] for r in rows}

        items = [
            {
                "id": s.id,
                "token": s.token,
                "share_type": s.share_type,
                "locale": s.locale,
                "user_id": s.user_id,
                "user_email": emails.get(s.user_id) if s.user_id else None,
                "expires_at": s.expires_at,
                "created_at": s.created_at,
            }
            for s in shares
        ]
        return {"items": items, "total": total, "limit": limit, "offset": offset}

    async def delete_result_share(self, share_id: int) -> None:
        result = await self._db.execute(
            select(ResultShare).where(ResultShare.id == share_id)
        )
        share = result.scalar_one_or_none()
        if share is None:
            raise NotFoundError("Share not found")

        fs = FileService()
        for fid in (share.image_file_id, share.original_image_file_id):
            if not fid:
                continue
            try:
                fs.delete(fid)
            except Exception:
                logger.warning("Failed to delete image %s for share %s", fid, share.token)

        await self._db.execute(
            delete(ResultShare).where(ResultShare.id == share_id)
        )
        await self._db.commit()
