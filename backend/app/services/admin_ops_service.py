from __future__ import annotations

import logging
from datetime import timedelta

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.credit_transaction import CreditTransaction
from app.models.processing_history import ProcessingHistory
from app.models.share_link import ShareLink
from app.models.tool import Tool
from app.models.user import User
from app.utils.time_utils import utcnow

logger = logging.getLogger(__name__)


def _days_ago(days: int):
    return utcnow() - timedelta(days=days)


class AdminOpsService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

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
