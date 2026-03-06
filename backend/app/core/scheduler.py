from __future__ import annotations

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core import database as _db
from app.core.login_guard import login_guard
from app.core.token_blacklist import token_blacklist
from app.services.hub_service import HubService
from app.services.result_share_service import ResultShareService
from app.services.photo_service import cleanup_expired_sessions
from app.services.share_service import ShareService


scheduler = AsyncIOScheduler(timezone="UTC")


def setup_scheduler(_: AsyncIOScheduler) -> None:
    async def _expire_hub_files() -> None:
        async with _db.SessionLocal() as db:
            await HubService(db).expire_files()

    scheduler.add_job(
        _expire_hub_files,
        "interval",
        minutes=15,
        id="expire_hub_files",
        replace_existing=True,
        misfire_grace_time=60,
    )

    async def _expire_share_links() -> None:
        async with _db.SessionLocal() as db:
            await ShareService(db).expire_pending_links()

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
        async with _db.SessionLocal() as db:
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

    async def _expire_result_shares() -> None:
        async with _db.SessionLocal() as db:
            await ResultShareService(db).expire_shares()

    scheduler.add_job(
        _expire_result_shares,
        "interval",
        hours=1,
        id="expire_result_shares",
        replace_existing=True,
        misfire_grace_time=60,
    )

    async def _anonymize_deleted_accounts() -> None:
        import logging
        import uuid
        from datetime import datetime, timedelta, timezone

        from sqlalchemy import select

        from app.models.user import User

        logger = logging.getLogger("app.scheduler")
        cutoff = datetime.now(timezone.utc) - timedelta(days=7)
        async with _db.SessionLocal() as db:
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

    async def _delete_unverified_accounts() -> None:
        import logging
        from datetime import datetime, timedelta, timezone

        from sqlalchemy import delete, select, update

        from app.models.credit_transaction import CreditTransaction
        from app.models.email_verification import EmailVerificationToken
        from app.models.result_share import ResultShare
        from app.models.user_file import ShareGroup, UserFile
        from app.models.login_history import LoginHistory
        from app.models.password_reset import PasswordResetToken
        from app.models.processing_history import ProcessingHistory
        from app.models.share_link import ShareLink
        from app.models.token_blacklist import TokenBlacklist
        from app.models.user import User
        from app.models.user_credit import UserCredit

        logger = logging.getLogger("app.scheduler")
        cutoff = datetime.now(timezone.utc) - timedelta(days=7)
        async with _db.SessionLocal() as db:
            result = await db.execute(
                select(User.id).where(
                    User.email_verified.is_(False),
                    User.created_at < cutoff,
                    User.is_active.is_(True),
                    User.google_sub.is_(None),
                )
            )
            user_ids = [row[0] for row in result.all()]
            if not user_ids:
                return

            # Delete rows with non-nullable FK
            for table in (
                CreditTransaction,
                EmailVerificationToken,
                PasswordResetToken,
                TokenBlacklist,
                LoginHistory,
                UserCredit,
            ):
                await db.execute(
                    delete(table).where(table.user_id.in_(user_ids))
                )
            # Nullify nullable FK references
            await db.execute(
                update(ProcessingHistory)
                .where(ProcessingHistory.user_id.in_(user_ids))
                .values(user_id=None)
            )
            await db.execute(
                update(ResultShare)
                .where(ResultShare.user_id.in_(user_ids))
                .values(user_id=None)
            )
            await db.execute(
                update(UserFile)
                .where(UserFile.user_id.in_(user_ids))
                .values(user_id=None)
            )
            # CASCADE handles share_group_files
            await db.execute(
                delete(ShareGroup).where(ShareGroup.user_id.in_(user_ids))
            )
            await db.execute(
                delete(ShareLink).where(ShareLink.from_user_id.in_(user_ids))
            )
            await db.execute(
                update(ShareLink)
                .where(ShareLink.to_user_id.in_(user_ids))
                .values(to_user_id=None)
            )
            await db.execute(delete(User).where(User.id.in_(user_ids)))
            await db.commit()
            logger.info(
                "Deleted %d unverified accounts older than 7 days",
                len(user_ids),
            )

    scheduler.add_job(
        _delete_unverified_accounts,
        "interval",
        hours=6,
        id="delete_unverified_accounts",
        replace_existing=True,
        misfire_grace_time=60,
    )
