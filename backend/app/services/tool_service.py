"""Tool configuration service with in-memory TTL cache."""

from __future__ import annotations

import logging
import time
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import database as _db
from app.core.exceptions import AppError, NotFoundError
from app.models.processing_history import ProcessingHistory
from app.models.tool import Tool

logger = logging.getLogger(__name__)

_CACHE_TTL = 60  # seconds

# Module-level cache shared across all callers
_cache: dict[str, Tool] = {}
_cache_ts: float = 0.0


def _is_cache_valid() -> bool:
    return bool(_cache) and (time.monotonic() - _cache_ts) < _CACHE_TTL


def invalidate_cache() -> None:
    global _cache_ts  # noqa: PLW0603
    _cache_ts = 0.0


async def _refresh_cache(db: AsyncSession) -> None:
    global _cache, _cache_ts  # noqa: PLW0603
    result = await db.execute(select(Tool).order_by(Tool.display_order))
    tools = result.scalars().all()
    # Detach from session so cached objects are safe to read later
    for t in tools:
        db.expunge(t)
    _cache = {t.tool_name: t for t in tools}
    _cache_ts = time.monotonic()


async def get_tool(tool_name: str) -> Tool | None:
    """Get a single tool config, using cache."""
    if not _is_cache_valid():
        async with _db.SessionLocal() as db:
            await _refresh_cache(db)
    return _cache.get(tool_name)


async def list_tools() -> list[Tool]:
    """List all tools, ordered by display_order."""
    if not _is_cache_valid():
        async with _db.SessionLocal() as db:
            await _refresh_cache(db)
    return list(_cache.values())


async def update_tool(tool_name: str, **fields: object) -> Tool:
    """Update tool fields and invalidate cache. Returns updated tool."""
    async with _db.SessionLocal() as db:
        result = await db.execute(
            select(Tool).where(Tool.tool_name == tool_name).with_for_update(),
        )
        tool = result.scalar_one_or_none()
        if tool is None:
            raise NotFoundError(f"Tool '{tool_name}' not found")

        allowed = {
            "is_enabled", "credit_cost", "display_order",
            "display_name_zh", "display_name_en",
            "description_zh", "description_en", "icon",
            "access_level", "daily_limit_anon", "daily_limit_auth",
        }
        for key, value in fields.items():
            if key in allowed:
                setattr(tool, key, value)

        await db.commit()
        await db.refresh(tool)
        db.expunge(tool)
        invalidate_cache()
        return tool


async def get_daily_usage_count(
    tool_name: str,
    user_id: int | None,
) -> int:
    """Count today's usage for a tool by a specific user (or all anonymous)."""
    today = date.today()
    async with _db.SessionLocal() as db:
        stmt = (
            select(func.count())
            .select_from(ProcessingHistory)
            .where(
                ProcessingHistory.tool_name == tool_name,
                func.date(ProcessingHistory.created_at) == today,
            )
        )
        if user_id is not None:
            stmt = stmt.where(ProcessingHistory.user_id == user_id)
        else:
            stmt = stmt.where(ProcessingHistory.user_id.is_(None))
        result = await db.execute(stmt)
        return int(result.scalar_one() or 0)
