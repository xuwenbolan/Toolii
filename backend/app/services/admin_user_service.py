from __future__ import annotations

from datetime import timedelta

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError, NotFoundError
from app.models.credit_transaction import CreditTransaction
from app.models.login_history import LoginHistory
from app.models.processing_history import ProcessingHistory
from app.models.user import User
from app.models.user_credit import UserCredit
from app.models.user_file import FileStatus, ShareGroup, ShareGroupFile, ShareGroupStatus, UserFile
from app.services.credit_service import CreditService
from app.utils.time_utils import utcnow


class AdminUserService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_users(
        self,
        *,
        limit: int = 20,
        offset: int = 0,
        search: str | None = None,
        is_active: bool | None = None,
    ) -> dict:
        base = select(User).where(User.deleted_at.is_(None))
        count_base = select(func.count()).select_from(User).where(User.deleted_at.is_(None))

        if search:
            pattern = f"%{search}%"
            base = base.where(User.email.ilike(pattern) | User.name.ilike(pattern))
            count_base = count_base.where(User.email.ilike(pattern) | User.name.ilike(pattern))
        if is_active is not None:
            base = base.where(User.is_active == is_active)
            count_base = count_base.where(User.is_active == is_active)

        total = int((await self._db.execute(count_base)).scalar_one())
        users = (await self._db.execute(
            base.order_by(User.id.desc()).limit(limit).offset(offset)
        )).scalars().all()

        # Batch-load balances
        user_ids = [u.id for u in users]
        balances: dict[int, int] = {}
        if user_ids:
            rows = (await self._db.execute(
                select(UserCredit.user_id, UserCredit.balance)
                .where(UserCredit.user_id.in_(user_ids))
            )).all()
            balances = {r[0]: int(r[1]) for r in rows}

        items = [
            {
                "id": u.id,
                "email": u.email,
                "name": u.name,
                "balance": balances.get(u.id, 0),
                "is_active": u.is_active,
                "email_verified": u.email_verified,
                "is_admin": u.is_admin,
                "created_at": u.created_at,
            }
            for u in users
        ]
        return {"items": items, "total": total, "limit": limit, "offset": offset}

    async def get_user_detail(self, user_id: int) -> dict:
        result = await self._db.execute(
            select(User).where(User.id == user_id, User.deleted_at.is_(None))
        )
        user = result.scalar_one_or_none()
        if user is None:
            raise NotFoundError("User not found")

        # Balance
        wallet = (await self._db.execute(
            select(UserCredit).where(UserCredit.user_id == user_id)
        )).scalar_one_or_none()
        balance = int(wallet.balance) if wallet else 0

        # Recent logins (last 10)
        logins = (await self._db.execute(
            select(LoginHistory)
            .where(LoginHistory.user_id == user_id)
            .order_by(LoginHistory.id.desc())
            .limit(10)
        )).scalars().all()

        # Recent transactions (last 10)
        transactions = (await self._db.execute(
            select(CreditTransaction)
            .where(CreditTransaction.user_id == user_id)
            .order_by(CreditTransaction.id.desc())
            .limit(10)
        )).scalars().all()

        # Recent processing (last 10)
        processing = (await self._db.execute(
            select(ProcessingHistory)
            .where(ProcessingHistory.user_id == user_id)
            .order_by(ProcessingHistory.id.desc())
            .limit(10)
        )).scalars().all()

        return {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "balance": balance,
            "is_active": user.is_active,
            "email_verified": user.email_verified,
            "is_admin": user.is_admin,
            "created_at": user.created_at,
            "hub_quota_mb": user.hub_quota_mb,
            "hub_max_files": user.hub_max_files,
            "hub_max_retention_days": user.hub_max_retention_days,
            "recent_logins": [
                {"id": l.id, "ip": l.ip, "user_agent": l.user_agent, "created_at": l.created_at}
                for l in logins
            ],
            "recent_transactions": [
                {
                    "id": t.id, "tx_type": t.tx_type, "amount": t.amount,
                    "balance_before": t.balance_before, "balance_after": t.balance_after,
                    "description": t.description, "created_at": t.created_at,
                }
                for t in transactions
            ],
            "recent_processing": [
                {"id": p.id, "tool_name": p.tool_name, "status": p.status, "created_at": p.created_at}
                for p in processing
            ],
        }

    async def toggle_user_status(self, user_id: int, *, is_active: bool) -> None:
        result = await self._db.execute(
            select(User).where(User.id == user_id, User.deleted_at.is_(None))
        )
        user = result.scalar_one_or_none()
        if user is None:
            raise NotFoundError("User not found")
        if user.is_admin:
            raise AppError("Cannot change status of an admin user")
        user.is_active = is_active
        await self._db.commit()

    async def update_hub_settings(
        self,
        user_id: int,
        *,
        hub_quota_mb: int | None,
        hub_max_files: int | None,
        hub_max_retention_days: int | None,
    ) -> None:
        result = await self._db.execute(
            select(User).where(User.id == user_id, User.deleted_at.is_(None))
        )
        user = result.scalar_one_or_none()
        if user is None:
            raise NotFoundError("User not found")

        user.hub_quota_mb = hub_quota_mb
        user.hub_max_files = hub_max_files
        user.hub_max_retention_days = hub_max_retention_days

        # Always sync files' expires_at to match the current retention setting
        await self._sync_file_expiry(user_id, hub_max_retention_days)

        await self._db.commit()

    async def _sync_file_expiry(
        self, user_id: int, new_retention_days: int | None
    ) -> None:
        """Update expires_at on all active files and their share groups.

        Convention: NULL = global default (7 days), 0 = unlimited.
        """
        if new_retention_days == 0:
            # Unlimited -- clear expiration on all active files
            await self._db.execute(
                update(UserFile)
                .where(
                    UserFile.user_id == user_id,
                    UserFile.status == FileStatus.ACTIVE,
                )
                .values(expires_at=None)
            )
        else:
            days = new_retention_days if new_retention_days else 7
            # Recalculate from each file's created_at; cap at now so
            # already-past files don't get revived
            now = utcnow()
            stmt = select(UserFile).where(
                UserFile.user_id == user_id,
                UserFile.status == FileStatus.ACTIVE,
            )
            result = await self._db.execute(stmt)
            for uf in result.scalars():
                new_exp = uf.created_at + timedelta(days=days)
                uf.expires_at = new_exp if new_exp > now else uf.expires_at

        # Sync share groups containing this user's files
        await self._sync_share_group_expiry(user_id)

    async def _sync_share_group_expiry(self, user_id: int) -> None:
        """Recalculate expires_at for all active share groups containing this user's files."""
        # Find all active share groups that contain this user's files
        sg_ids_result = await self._db.execute(
            select(ShareGroupFile.share_group_id)
            .join(UserFile, ShareGroupFile.user_file_id == UserFile.id)
            .join(ShareGroup, ShareGroup.id == ShareGroupFile.share_group_id)
            .where(
                UserFile.user_id == user_id,
                ShareGroup.status == ShareGroupStatus.ACTIVE,
            )
            .distinct()
        )
        for (sg_id,) in sg_ids_result.all():
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

    async def adjust_credits(
        self, user_id: int, *, amount: int, description: str
    ) -> dict:
        # Verify user exists
        result = await self._db.execute(
            select(User).where(User.id == user_id, User.deleted_at.is_(None))
        )
        if result.scalar_one_or_none() is None:
            raise NotFoundError("User not found")

        svc = CreditService(self._db)
        if amount > 0:
            r = await svc.add(
                user_id=user_id,
                amount=amount,
                tx_type="admin_adjust",
                description=description,
            )
            return {
                "balance_before": r.balance_before,
                "balance_after": r.balance_after,
                "transaction_id": r.transaction_id,
            }
        elif amount < 0:
            r = await svc.consume(
                user_id=user_id,
                amount=abs(amount),
                tx_type="admin_adjust",
                description=description,
            )
            return {
                "balance_before": r.balance_before,
                "balance_after": r.balance_after,
                "transaction_id": r.transaction_id,
            }
        else:
            raise AppError(code="INVALID_AMOUNT", message="Amount must not be zero", status_code=400)
