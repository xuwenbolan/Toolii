from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.processing_history import ProcessingHistory
from app.services.file_service import FileService
from app.services.result_share_service import ResultShareService
from app.services.transfer_service import TransferService
from app.utils.time_utils import utcnow

logger = logging.getLogger(__name__)


def _scan_directory(dir_path: Path) -> dict:
    """Scan a storage directory and return file count and total size."""
    count = 0
    total_size = 0
    if dir_path.exists():
        for p in dir_path.rglob("*"):
            if not p.is_file() or p.suffix == ".json":
                continue
            count += 1
            try:
                total_size += p.stat().st_size
            except OSError:
                pass
    return {"name": dir_path.name, "file_count": count, "total_size_bytes": total_size}


class StorageAdminService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_overview(self) -> dict:
        dirs = [
            Path(settings.file_storage_dir),
            Path(settings.transfer_storage_dir),
            Path(settings.result_share_storage_dir),
        ]
        # Run filesystem scan in thread pool to avoid blocking event loop
        loop = asyncio.get_running_loop()
        dir_stats = await asyncio.gather(
            *(loop.run_in_executor(None, _scan_directory, d) for d in dirs)
        )

        today = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        total = int(
            (await self._db.execute(
                select(func.count()).select_from(ProcessingHistory)
            )).scalar_one()
        )
        today_count = int(
            (await self._db.execute(
                select(func.count()).select_from(ProcessingHistory)
                .where(ProcessingHistory.created_at >= today)
            )).scalar_one()
        )

        return {
            "directories": list(dir_stats),
            "processing": {"total": total, "today": today_count},
        }

    async def run_cleanup(self, target: str) -> dict:
        files_removed = 0
        transfers_expired = 0
        shares_expired = 0

        if target in ("files", "all"):
            fs = FileService()
            files_removed = await asyncio.get_running_loop().run_in_executor(
                None, fs.cleanup_expired_files
            )

        if target in ("transfers", "all"):
            svc = TransferService(self._db)
            transfers_expired = await svc.expire_transfers()

        if target in ("result_shares", "all"):
            svc = ResultShareService(self._db)
            shares_expired = await svc.expire_shares()

        return {
            "files_removed": files_removed,
            "transfers_expired": transfers_expired,
            "shares_expired": shares_expired,
        }
