from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import case, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.exceptions import AppError, NotFoundError
from app.utils.time_utils import utcnow
from app.models.audit_log import AuditLog
from app.models.card_code import CardCode
from app.models.credit_transaction import CreditTransaction
from app.models.result_share import ResultShare
from app.models.user_file import FileStatus, ShareGroup, ShareGroupFile, ShareGroupStatus, UserFile
from app.models.login_history import LoginHistory
from app.models.processing_history import ProcessingHistory
from app.models.share_link import ShareLink
from app.models.tool import Tool
from app.models.user import User
from app.models.user_credit import UserCredit
from app.services.credit_service import CreditService
from app.services.file_service import FileService
from app.utils.hash_utils import sha256_hex

logger = logging.getLogger(__name__)

CARD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _days_ago(days: int) -> datetime:
    return utcnow() - timedelta(days=days)


def _today_start() -> datetime:
    return utcnow().replace(hour=0, minute=0, second=0, microsecond=0)


class AdminService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ── Dashboard ──────────────────────────────────────────

    async def get_dashboard_stats(self, days: int = 30) -> dict:
        now = utcnow()
        today = _today_start()
        week_ago = _days_ago(7)
        period_start = _days_ago(days)

        # User counts
        total_users = int(
            (await self._db.execute(
                select(func.count()).select_from(User).where(User.deleted_at.is_(None))
            )).scalar_one()
        )
        new_users_today = int(
            (await self._db.execute(
                select(func.count()).select_from(User)
                .where(User.created_at >= today, User.deleted_at.is_(None))
            )).scalar_one()
        )
        active_users_7d = int(
            (await self._db.execute(
                select(func.count(func.distinct(ProcessingHistory.user_id)))
                .where(ProcessingHistory.created_at >= week_ago)
            )).scalar_one()
        )

        # Revenue (sum of positive redeem transactions)
        total_revenue = int(
            (await self._db.execute(
                select(func.coalesce(func.sum(CreditTransaction.amount), 0))
                .where(CreditTransaction.tx_type == "redeem")
            )).scalar_one()
        )
        revenue_today = int(
            (await self._db.execute(
                select(func.coalesce(func.sum(CreditTransaction.amount), 0))
                .where(CreditTransaction.tx_type == "redeem", CreditTransaction.created_at >= today)
            )).scalar_one()
        )

        # Tool usage
        total_tool_uses = int(
            (await self._db.execute(
                select(func.count()).select_from(ProcessingHistory)
            )).scalar_one()
        )
        tool_uses_today = int(
            (await self._db.execute(
                select(func.count()).select_from(ProcessingHistory)
                .where(ProcessingHistory.created_at >= today)
            )).scalar_one()
        )

        # Tool ranking (JOIN tools to filter out dirty data and get display names)
        ranking_rows = (await self._db.execute(
            select(
                ProcessingHistory.tool_name,
                func.coalesce(Tool.display_name_zh, ProcessingHistory.tool_name).label("display_name"),
                func.count().label("cnt"),
            )
            .join(Tool, Tool.tool_name == ProcessingHistory.tool_name)
            .group_by(ProcessingHistory.tool_name, Tool.display_name_zh)
            .order_by(func.count().desc())
            .limit(10)
        )).all()
        tool_ranking = [
            {"tool_name": r[0], "display_name": r[1], "count": r[2]}
            for r in ranking_rows
        ]

        # Build full date range for trend charts
        all_dates = [
            (period_start + timedelta(days=i)).strftime("%Y-%m-%d")
            for i in range(days + 1)
        ]

        # Trends (last N days) — fill missing dates with 0
        date_col = func.date(User.created_at)
        user_trend_rows = (await self._db.execute(
            select(date_col.label("d"), func.count().label("c"))
            .where(User.created_at >= period_start, User.deleted_at.is_(None))
            .group_by(date_col)
            .order_by(date_col)
        )).all()
        user_map = {str(r[0]): r[1] for r in user_trend_rows}
        user_trend = [{"date": d, "value": user_map.get(d, 0)} for d in all_dates]

        tool_date_col = func.date(ProcessingHistory.created_at)
        tool_trend_rows = (await self._db.execute(
            select(tool_date_col.label("d"), func.count().label("c"))
            .where(ProcessingHistory.created_at >= period_start)
            .group_by(tool_date_col)
            .order_by(tool_date_col)
        )).all()
        tool_map = {str(r[0]): r[1] for r in tool_trend_rows}
        tool_trend = [{"date": d, "value": tool_map.get(d, 0)} for d in all_dates]

        rev_date_col = func.date(CreditTransaction.created_at)
        revenue_trend_rows = (await self._db.execute(
            select(rev_date_col.label("d"), func.coalesce(func.sum(CreditTransaction.amount), 0).label("c"))
            .where(CreditTransaction.tx_type == "redeem", CreditTransaction.created_at >= period_start)
            .group_by(rev_date_col)
            .order_by(rev_date_col)
        )).all()
        rev_map = {str(r[0]): int(r[1]) for r in revenue_trend_rows}
        revenue_trend = [{"date": d, "value": rev_map.get(d, 0)} for d in all_dates]

        return {
            "total_users": total_users,
            "new_users_today": new_users_today,
            "active_users_7d": active_users_7d,
            "total_revenue": total_revenue,
            "revenue_today": revenue_today,
            "total_tool_uses": total_tool_uses,
            "tool_uses_today": tool_uses_today,
            "tool_ranking": tool_ranking,
            "user_trend": user_trend,
            "tool_trend": tool_trend,
            "revenue_trend": revenue_trend,
        }

    # ── Users ──────────────────────────────────────────────

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

        old_retention = user.hub_max_retention_days
        user.hub_quota_mb = hub_quota_mb
        user.hub_max_files = hub_max_files
        user.hub_max_retention_days = hub_max_retention_days

        # Sync existing active files' expires_at when retention setting changes
        if hub_max_retention_days != old_retention:
            await self._sync_file_expiry(user_id, hub_max_retention_days)

        await self._db.commit()

    async def _sync_file_expiry(
        self, user_id: int, new_retention_days: int | None
    ) -> None:
        """Update expires_at on all active files to match new retention setting.

        Convention: NULL = global default (7 days), 0 = unlimited.
        """
        from sqlalchemy import update

        if new_retention_days == 0:
            # Unlimited — clear expiration on all active files
            new_expires = None
        else:
            days = new_retention_days if new_retention_days else 7
            # Recalculate from each file's created_at; cap at now so
            # already-past files don't get revived
            now = utcnow()
            stmt = (
                select(UserFile)
                .where(
                    UserFile.user_id == user_id,
                    UserFile.status == FileStatus.ACTIVE,
                )
            )
            result = await self._db.execute(stmt)
            for uf in result.scalars():
                new_exp = uf.created_at + timedelta(days=days)
                uf.expires_at = new_exp if new_exp > now else uf.expires_at
            return

        # Unlimited case — bulk update
        await self._db.execute(
            update(UserFile)
            .where(
                UserFile.user_id == user_id,
                UserFile.status == FileStatus.ACTIVE,
            )
            .values(expires_at=new_expires)
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

    # ── Cards ──────────────────────────────────────────────

    async def list_cards(
        self,
        *,
        limit: int = 20,
        offset: int = 0,
        status: str | None = None,
        card_type: str | None = None,
    ) -> dict:
        base = select(CardCode)
        count_base = select(func.count()).select_from(CardCode)

        if status:
            base = base.where(CardCode.status == status)
            count_base = count_base.where(CardCode.status == status)
        if card_type:
            base = base.where(CardCode.card_type == card_type)
            count_base = count_base.where(CardCode.card_type == card_type)

        total = int((await self._db.execute(count_base)).scalar_one())
        cards = (await self._db.execute(
            base.order_by(CardCode.id.desc()).limit(limit).offset(offset)
        )).scalars().all()

        # Batch-load redeemer emails
        redeemer_ids = [c.redeemed_by_user_id for c in cards if c.redeemed_by_user_id]
        emails: dict[int, str] = {}
        if redeemer_ids:
            rows = (await self._db.execute(
                select(User.id, User.email).where(User.id.in_(redeemer_ids))
            )).all()
            emails = {r[0]: r[1] for r in rows}

        items = [
            {
                "id": c.id,
                "credits": c.credits,
                "card_type": c.card_type,
                "status": c.status,
                "redeemed_by_user_id": c.redeemed_by_user_id,
                "redeemed_by_email": emails.get(c.redeemed_by_user_id) if c.redeemed_by_user_id else None,
                "expires_at": c.expires_at,
                "redeemed_at": c.redeemed_at,
                "created_at": c.created_at,
            }
            for c in cards
        ]
        return {"items": items, "total": total, "limit": limit, "offset": offset}

    async def generate_cards(
        self,
        *,
        count: int,
        credits: int,
        card_type: str,
        prefix: str,
        expires_days: int | None,
    ) -> list[str]:
        expires_at = None
        if expires_days is not None:
            expires_at = utcnow() + timedelta(days=expires_days)

        codes: list[str] = []
        seen_hashes: set[str] = set()
        while len(codes) < count:
            parts = ["".join(secrets.choice(CARD_ALPHABET) for _ in range(4)) for _ in range(3)]
            plain = f"{prefix}-" + "-".join(parts)
            code_hash = sha256_hex(plain)
            if code_hash in seen_hashes:
                continue
            seen_hashes.add(code_hash)
            codes.append(plain)

        for plain in codes:
            self._db.add(
                CardCode(
                    code_hash=sha256_hex(plain),
                    credits=credits,
                    card_type=card_type,
                    status="unused",
                    expires_at=expires_at,
                )
            )
        await self._db.flush()
        await self._db.commit()
        return codes

    async def disable_card(self, card_id: int) -> None:
        result = await self._db.execute(
            select(CardCode).where(CardCode.id == card_id)
        )
        card = result.scalar_one_or_none()
        if card is None:
            raise NotFoundError("Card not found")
        if card.status != "unused":
            raise AppError(
                code="CARD_NOT_UNUSED",
                message="Only unused cards can be disabled",
                status_code=400,
            )
        card.status = "disabled"
        await self._db.commit()

    async def get_card_summary(self) -> dict:
        # Status counts
        rows = (await self._db.execute(
            select(CardCode.status, func.count().label("cnt"))
            .group_by(CardCode.status)
        )).all()
        status_counts = [{"status": r[0], "count": r[1]} for r in rows]

        # Total credits issued vs redeemed
        total_issued = int(
            (await self._db.execute(
                select(func.coalesce(func.sum(CardCode.credits), 0))
            )).scalar_one()
        )
        total_redeemed = int(
            (await self._db.execute(
                select(func.coalesce(func.sum(CardCode.credits), 0))
                .where(CardCode.status == "redeemed")
            )).scalar_one()
        )

        return {
            "status_counts": status_counts,
            "total_credits_issued": total_issued,
            "total_credits_redeemed": total_redeemed,
        }

    # ── Operations ─────────────────────────────────────────

    async def get_tool_usage(
        self,
        *,
        days: int = 30,
        tool_name: str | None = None,
    ) -> list[dict]:
        period_start = _days_ago(days)
        date_col = func.date(ProcessingHistory.created_at)

        display_name_col = func.coalesce(
            Tool.display_name_zh, ProcessingHistory.tool_name,
        ).label("display_name")
        stmt = (
            select(
                ProcessingHistory.tool_name,
                date_col.label("d"),
                func.count().label("total"),
                func.sum(case((ProcessingHistory.status == "done", 1), else_=0)).label("success"),
                func.sum(case((ProcessingHistory.status == "failed", 1), else_=0)).label("fail"),
                display_name_col,
            )
            .join(Tool, Tool.tool_name == ProcessingHistory.tool_name)
            .where(ProcessingHistory.created_at >= period_start)
        )
        if tool_name:
            stmt = stmt.where(ProcessingHistory.tool_name == tool_name)

        stmt = stmt.group_by(
            ProcessingHistory.tool_name, date_col, Tool.display_name_zh,
        ).order_by(date_col)
        rows = (await self._db.execute(stmt)).all()

        return [
            {
                "tool_name": r[0],
                "date": str(r[1]),
                "count": int(r[2]),
                "success_count": int(r[3]),
                "fail_count": int(r[4]),
                "display_name": r[5],
            }
            for r in rows
        ]

    async def list_transactions(
        self,
        *,
        limit: int = 20,
        offset: int = 0,
        tx_type: str | None = None,
    ) -> dict:
        base = select(CreditTransaction)
        count_base = select(func.count()).select_from(CreditTransaction)

        if tx_type:
            base = base.where(CreditTransaction.tx_type == tx_type)
            count_base = count_base.where(CreditTransaction.tx_type == tx_type)

        total = int((await self._db.execute(count_base)).scalar_one())
        txns = (await self._db.execute(
            base.order_by(CreditTransaction.id.desc()).limit(limit).offset(offset)
        )).scalars().all()

        # Batch-load user emails
        user_ids = list({t.user_id for t in txns})
        emails: dict[int, str] = {}
        if user_ids:
            rows = (await self._db.execute(
                select(User.id, User.email).where(User.id.in_(user_ids))
            )).all()
            emails = {r[0]: r[1] for r in rows}

        items = [
            {
                "id": t.id,
                "user_id": t.user_id,
                "user_email": emails.get(t.user_id),
                "tx_type": t.tx_type,
                "amount": t.amount,
                "balance_before": t.balance_before,
                "balance_after": t.balance_after,
                "description": t.description,
                "reference_id": t.reference_id,
                "created_at": t.created_at,
            }
            for t in txns
        ]
        return {"items": items, "total": total, "limit": limit, "offset": offset}

    async def list_share_links(
        self,
        *,
        limit: int = 20,
        offset: int = 0,
        status: str | None = None,
    ) -> dict:
        base = select(ShareLink)
        count_base = select(func.count()).select_from(ShareLink)

        if status:
            base = base.where(ShareLink.status == status)
            count_base = count_base.where(ShareLink.status == status)

        total = int((await self._db.execute(count_base)).scalar_one())
        links = (await self._db.execute(
            base.order_by(ShareLink.id.desc()).limit(limit).offset(offset)
        )).scalars().all()

        # Batch-load user emails
        all_ids = list({l.from_user_id for l in links} | {l.to_user_id for l in links if l.to_user_id})
        emails: dict[int, str] = {}
        if all_ids:
            rows = (await self._db.execute(
                select(User.id, User.email).where(User.id.in_(all_ids))
            )).all()
            emails = {r[0]: r[1] for r in rows}

        items = [
            {
                "id": l.id,
                "token": l.token,
                "from_user_id": l.from_user_id,
                "from_user_email": emails.get(l.from_user_id),
                "to_user_id": l.to_user_id,
                "to_user_email": emails.get(l.to_user_id) if l.to_user_id else None,
                "amount": l.amount,
                "status": l.status,
                "expires_at": l.expires_at,
                "claimed_at": l.claimed_at,
                "created_at": l.created_at,
            }
            for l in links
        ]
        return {"items": items, "total": total, "limit": limit, "offset": offset}

    async def get_revenue(self, *, granularity: str = "day", days: int = 30) -> dict:
        period_start = _days_ago(days)

        if granularity == "week":
            # SQLite: strftime('%Y-W%W', date)
            period_col = func.strftime("%Y-W%W", CreditTransaction.created_at)
        elif granularity == "month":
            period_col = func.strftime("%Y-%m", CreditTransaction.created_at)
        else:
            period_col = func.date(CreditTransaction.created_at)

        rows = (await self._db.execute(
            select(
                period_col.label("p"),
                func.coalesce(func.sum(CreditTransaction.amount), 0).label("credits"),
                func.count().label("cnt"),
            )
            .where(CreditTransaction.tx_type == "redeem", CreditTransaction.created_at >= period_start)
            .group_by(period_col)
            .order_by(period_col)
        )).all()

        items = [{"period": str(r[0]), "total_credits": int(r[1]), "transaction_count": int(r[2])} for r in rows]
        total_credits = sum(i["total_credits"] for i in items)
        total_transactions = sum(i["transaction_count"] for i in items)

        return {
            "items": items,
            "total_credits": total_credits,
            "total_transactions": total_transactions,
        }

    # ── Storage: Processing History ─────────────────────────

    async def list_processing_history(
        self,
        *,
        limit: int = 20,
        offset: int = 0,
        tool_name: str | None = None,
        status: str | None = None,
    ) -> dict:
        base = (
            select(
                ProcessingHistory.id,
                ProcessingHistory.user_id,
                User.email.label("user_email"),
                ProcessingHistory.tool_name,
                func.coalesce(Tool.display_name_zh, ProcessingHistory.tool_name).label("display_name"),
                ProcessingHistory.status,
                ProcessingHistory.ip,
                ProcessingHistory.user_agent,
                ProcessingHistory.input_file_id,
                ProcessingHistory.output_file_id,
                ProcessingHistory.created_at,
            )
            .outerjoin(User, User.id == ProcessingHistory.user_id)
            .outerjoin(Tool, Tool.tool_name == ProcessingHistory.tool_name)
        )
        count_base = select(func.count()).select_from(ProcessingHistory)

        if tool_name:
            base = base.where(ProcessingHistory.tool_name == tool_name)
            count_base = count_base.where(ProcessingHistory.tool_name == tool_name)
        if status:
            base = base.where(ProcessingHistory.status == status)
            count_base = count_base.where(ProcessingHistory.status == status)

        total = int((await self._db.execute(count_base)).scalar_one())
        rows = (await self._db.execute(
            base.order_by(ProcessingHistory.id.desc()).limit(limit).offset(offset)
        )).all()

        items = [
            {
                "id": r.id,
                "user_id": r.user_id,
                "user_email": r.user_email,
                "tool_name": r.tool_name,
                "display_name": r.display_name,
                "status": r.status,
                "ip": r.ip,
                "user_agent": r.user_agent,
                "input_file_id": r.input_file_id,
                "output_file_id": r.output_file_id,
                "created_at": r.created_at,
            }
            for r in rows
        ]
        return {"items": items, "total": total, "limit": limit, "offset": offset}

    # ── Hub Files ─────────────────────────────────────────

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

    # ── Result Shares ──────────────────────────────────────

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

    # ── Audit Logs ─────────────────────────────────────────

    async def list_audit_logs(
        self,
        *,
        limit: int = 50,
        offset: int = 0,
        category: str | None = None,
        action: str | None = None,
        user_id: int | None = None,
        success: bool | None = None,
    ) -> dict:
        base = select(AuditLog)
        count_base = select(func.count()).select_from(AuditLog)

        if category:
            base = base.where(AuditLog.category == category)
            count_base = count_base.where(AuditLog.category == category)
        if action:
            base = base.where(AuditLog.action == action)
            count_base = count_base.where(AuditLog.action == action)
        if user_id is not None:
            base = base.where(AuditLog.user_id == user_id)
            count_base = count_base.where(AuditLog.user_id == user_id)
        if success is not None:
            base = base.where(AuditLog.success == success)
            count_base = count_base.where(AuditLog.success == success)

        total = int((await self._db.execute(count_base)).scalar_one())
        logs = (await self._db.execute(
            base.order_by(AuditLog.id.desc()).limit(limit).offset(offset)
        )).scalars().all()

        # Batch-load user emails
        uid_set = {log.user_id for log in logs if log.user_id is not None}
        emails: dict[int, str] = {}
        if uid_set:
            rows = (await self._db.execute(
                select(User.id, User.email).where(User.id.in_(uid_set))
            )).all()
            emails = {r[0]: r[1] for r in rows}

        items = [
            {
                "id": log.id,
                "user_id": log.user_id,
                "user_email": emails.get(log.user_id) if log.user_id else None,
                "category": log.category,
                "action": log.action,
                "success": log.success,
                "resource_type": log.resource_type,
                "resource_id": log.resource_id,
                "ip": log.ip,
                "user_agent": log.user_agent,
                "detail": log.detail,
                "created_at": log.created_at,
            }
            for log in logs
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
