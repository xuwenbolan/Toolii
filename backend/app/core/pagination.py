"""Shared pagination helper for service layer queries."""

from __future__ import annotations

from typing import Any, Sequence, TypeVar

from sqlalchemy import Select, func, over, select
from sqlalchemy.ext.asyncio import AsyncSession

T = TypeVar("T")


async def paginate(
    db: AsyncSession,
    base: Select[Any],
    *,
    order_by: Any,
    limit: int,
    offset: int,
) -> tuple[Sequence[Any], int]:
    """Execute a paginated query returning (items, total_count).

    Uses COUNT(*) OVER() window function to get total in a single query.
    """
    # Build a subquery with a total_count window column
    sub = base.add_columns(
        over(func.count(), rows=None).label("_total_count")
    ).order_by(order_by).offset(offset).limit(limit)

    result = await db.execute(sub)
    rows = result.all()

    if not rows:
        return [], 0

    # Each row is (entity, _total_count); extract both
    items = [row[0] for row in rows]
    total = rows[0][-1]

    return items, total
