from __future__ import annotations

from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core import database as _db
from app.core.login_guard import login_guard
from app.core.token_blacklist import token_blacklist
from app.services.file_service import FileService
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
    async def _cleanup_login_guard() -> None:
        async with _db.SessionLocal() as db:
            await login_guard.cleanup_expired(db)

    scheduler.add_job(
        _cleanup_login_guard,
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
        from app.models.user_file import FileStatus, ShareGroup, UserFile
        from app.models.login_history import LoginHistory
        from app.models.password_reset import PasswordResetToken
        from app.models.processing_history import ProcessingHistory
        from app.models.share_link import ShareLink
        from app.models.token_blacklist import TokenBlacklist
        from app.models.user import User
        from app.models.user_credit import UserCredit

        logger = logging.getLogger("app.scheduler")
        fs = FileService()
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

            # Delete user files from disk before removing DB records
            file_result = await db.execute(
                select(UserFile).where(
                    UserFile.user_id.in_(user_ids),
                    UserFile.status.in_([FileStatus.ACTIVE, FileStatus.PENDING]),
                )
            )
            for uf in file_result.scalars().all():
                for fid in (uf.file_id, uf.thumb_file_id):
                    if fid:
                        try:
                            fs.delete(fid)
                        except OSError:
                            pass
                uf.status = FileStatus.DELETED

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

    async def _cleanup_old_records() -> None:
        """Purge old anonymous ProcessingHistory and AuditLog records."""
        import logging
        from datetime import datetime, timedelta, timezone

        from sqlalchemy import delete

        from app.models.audit_log import AuditLog
        from app.models.processing_history import ProcessingHistory

        logger = logging.getLogger("app.scheduler")
        async with _db.SessionLocal() as db:
            # Anonymous processing history older than 30 days
            ph_cutoff = datetime.now(timezone.utc) - timedelta(days=30)
            ph_result = await db.execute(
                delete(ProcessingHistory).where(
                    ProcessingHistory.user_id.is_(None),
                    ProcessingHistory.created_at < ph_cutoff,
                )
            )
            ph_count = ph_result.rowcount

            # Audit logs older than 90 days (all, not just anonymous)
            al_cutoff = datetime.now(timezone.utc) - timedelta(days=90)
            al_result = await db.execute(
                delete(AuditLog).where(AuditLog.created_at < al_cutoff)
            )
            al_count = al_result.rowcount

            await db.commit()
            if ph_count or al_count:
                logger.info(
                    "Cleaned up %d anonymous processing_history and %d audit_log records",
                    ph_count, al_count,
                )

    scheduler.add_job(
        _cleanup_old_records,
        "interval",
        hours=24,
        id="cleanup_old_records",
        replace_existing=True,
        misfire_grace_time=300,
    )
