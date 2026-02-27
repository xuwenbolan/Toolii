from __future__ import annotations

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core.database import SessionLocal
from app.services.file_service import FileService
from app.services.share_service import ShareService


scheduler = AsyncIOScheduler(timezone="UTC")


def setup_scheduler(_: AsyncIOScheduler) -> None:
    def _cleanup_files() -> None:
        FileService().cleanup_expired_files()

    async def _expire_share_links() -> None:
        async with SessionLocal() as db:
            await ShareService(db).expire_pending_links()

    scheduler.add_job(
        _cleanup_files,
        "interval",
        hours=1,
        id="cleanup_files",
        replace_existing=True,
        misfire_grace_time=60,
    )
    scheduler.add_job(
        _expire_share_links,
        "interval",
        minutes=15,
        id="expire_share_links",
        replace_existing=True,
        misfire_grace_time=60,
    )
