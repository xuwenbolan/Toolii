from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import paginate
from app.models.processing_history import ProcessingHistory


class HistoryService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def record(
        self,
        *,
        user_id: int,
        tool_name: str,
        input_file_id: str | None = None,
        output_file_id: str | None = None,
        status: str = "done",
    ) -> None:
        entry = ProcessingHistory(
            user_id=user_id,
            tool_name=tool_name,
            input_file_id=input_file_id,
            output_file_id=output_file_id,
            status=status,
        )
        self._db.add(entry)
        await self._db.commit()

    async def list_history(
        self,
        *,
        user_id: int,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[ProcessingHistory], int]:
        base = select(ProcessingHistory).where(ProcessingHistory.user_id == user_id)
        items, total = await paginate(
            self._db, base,
            order_by=ProcessingHistory.created_at.desc(),
            limit=limit, offset=offset,
        )
        return list(items), total
