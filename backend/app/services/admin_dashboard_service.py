from __future__ import annotations

from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.credit_transaction import CreditTransaction
from app.models.processing_history import ProcessingHistory
from app.models.tool import Tool
from app.models.user import User
from app.utils.time_utils import utcnow


def _days_ago(days: int):
    return utcnow() - timedelta(days=days)


def _today_start():
    return utcnow().replace(hour=0, minute=0, second=0, microsecond=0)


class AdminDashboardService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_dashboard_stats(self, days: int = 30) -> dict:
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

        # Trends (last N days) -- fill missing dates with 0
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
