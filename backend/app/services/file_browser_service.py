from __future__ import annotations

import logging
from pathlib import Path

from sqlalchemy import func, select

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.user_file import UserFile
from app.services.file_service import build_download_url

logger = logging.getLogger(__name__)

_PREVIEWABLE_TYPES = frozenset({
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
    "application/pdf",
})


class FileBrowserService:
    async def list_files(
        self,
        directory: str,
        *,
        offset: int = 0,
        limit: int = 50,
        search: str | None = None,
    ) -> dict:
        if directory != "hub":
            return {"items": [], "total": 0, "directory": directory}

        async with SessionLocal() as session:
            base = select(UserFile).where(UserFile.status == "active")
            count_base = select(func.count(UserFile.id)).where(UserFile.status == "active")

            if search:
                needle = f"%{search}%"
                base = base.where(UserFile.original_filename.ilike(needle))
                count_base = count_base.where(UserFile.original_filename.ilike(needle))

            total = (await session.execute(count_base)).scalar() or 0

            stmt = (
                base
                .order_by(UserFile.created_at.desc())
                .offset(offset)
                .limit(limit)
            )
            rows = (await session.execute(stmt)).scalars().all()

            items = [
                {
                    "file_id": row.file_id,
                    "original_filename": row.original_filename,
                    "content_type": row.content_type,
                    "size": row.size,
                    "created_at": int(row.created_at.timestamp()),
                    "previewable": row.content_type in _PREVIEWABLE_TYPES,
                }
                for row in rows
            ]

        return {"items": items, "total": total, "directory": directory}

    async def get_admin_download_url(self, directory: str, file_id: str) -> str:
        """Generate a signed download URL for admin file access."""
        if directory != "hub":
            raise FileNotFoundError(f"Unknown directory: {directory}")

        path = Path(settings.hub_storage_dir) / file_id[:2] / file_id[2:4] / file_id
        if not path.exists():
            raise FileNotFoundError(f"File not found: {file_id}")

        # Look up original filename from database
        filename = file_id
        async with SessionLocal() as session:
            stmt = select(UserFile.original_filename).where(UserFile.file_id == file_id).limit(1)
            result = (await session.execute(stmt)).scalar()
            if result:
                filename = result

        return build_download_url(file_id=file_id, filename=filename, ttl_seconds=3600)
