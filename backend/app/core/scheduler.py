from __future__ import annotations

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core.database import SessionLocal
from app.core.login_guard import login_guard
from app.core.token_blacklist import token_blacklist
from app.services.file_service import FileService
from app.services.photo_service import cleanup_expired_sessions
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
    scheduler.add_job(
        login_guard.cleanup_expired,
        "interval",
        minutes=10,
        id="cleanup_login_guard",
        replace_existing=True,
        misfire_grace_time=60,
    )
    async def _cleanup_token_blacklist() -> None:
        async with SessionLocal() as db:
            await token_blacklist.cleanup_expired(db)

    scheduler.add_job(
        _cleanup_token_blacklist,
        "interval",
        minutes=30,
        id="cleanup_token_blacklist",
        replace_existing=True,
        misfire_grace_time=60,
    )
    scheduler.add_job(
        cleanup_expired_sessions,
        "interval",
        hours=1,
        id="cleanup_photo_sessions",
        replace_existing=True,
        misfire_grace_time=60,
    )

    async def _anonymize_deleted_accounts() -> None:
        import logging
        import uuid
        from datetime import datetime, timedelta, timezone

        from sqlalchemy import select, update

        from app.models.user import User

        logger = logging.getLogger("app.scheduler")
        cutoff = datetime.now(timezone.utc) - timedelta(days=7)
        async with SessionLocal() as db:
            result = await db.execute(
                select(User).where(
                    User.deleted_at.isnot(None),
                    User.deleted_at < cutoff,
                    User.is_active.is_(False),
                )
            )
            users = result.scalars().all()
            for user in users:
                anon = f"deleted_{uuid.uuid4().hex[:12]}@anonymized.local"
                user.email = anon
                user.name = None
                user.hashed_password = None
                user.google_sub = None
            if users:
                await db.commit()
                logger.info("Anonymized %d deleted accounts past recovery window", len(users))

    scheduler.add_job(
        _anonymize_deleted_accounts,
        "interval",
        hours=6,
        id="anonymize_deleted_accounts",
        replace_existing=True,
        misfire_grace_time=60,
    )
