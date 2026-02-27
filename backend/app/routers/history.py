from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import get_current_user, get_db
from app.models.user import User
from app.schemas.history import HistoryItem, HistoryListResponse
from app.services.history_service import HistoryService

router = APIRouter(prefix=f"{settings.api_prefix}/history", tags=["history"])


@router.get("", response_model=HistoryListResponse)
async def list_history(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> HistoryListResponse:
    svc = HistoryService(db)
    items, total = await svc.list_history(user_id=user.id, limit=limit, offset=offset)
    return HistoryListResponse(
        items=[HistoryItem.model_validate(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )
