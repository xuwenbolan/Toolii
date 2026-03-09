from __future__ import annotations

from fastapi import APIRouter, Depends, Path, Query, Request
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit_log import audit
from app.core.dependencies import get_admin_user, get_db
from app.core.rate_limiter import admin_write_rate_limit, limiter
from app.models.user import User
from app.schemas.admin import (
    AdminCardListResponse,
    CardGenerateRequest,
    CardGenerateResponse,
    CardSummaryResponse,
)
from app.schemas.common import Message
from app.services.admin_service import AdminService

router = APIRouter(prefix="/cards", tags=["admin-cards"])


@router.get("", response_model=AdminCardListResponse)
async def list_cards(
    admin: User = Depends(get_admin_user),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None),
    card_type: str | None = Query(default=None),
) -> AdminCardListResponse:
    data = await AdminService(db).list_cards(
        limit=limit, offset=offset, status=status, card_type=card_type,
    )
    return AdminCardListResponse(**data)


@router.post("/generate", response_model=CardGenerateResponse)
@limiter.limit(admin_write_rate_limit)
async def generate_cards(
    request: Request,
    payload: CardGenerateRequest,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> CardGenerateResponse:
    codes = await AdminService(db).generate_cards(
        count=payload.count,
        credits=payload.credits,
        card_type=payload.card_type,
        prefix=payload.prefix,
        expires_days=payload.expires_days,
    )
    await audit(
        category="admin",
        action="generate_cards",
        user_id=admin.id,
        ip=get_remote_address(request),
        detail={
            "count": payload.count,
            "credits": payload.credits,
            "card_type": payload.card_type,
        },
    )
    return CardGenerateResponse(codes=codes, count=len(codes))


@router.put("/{card_id}/disable", response_model=Message)
@limiter.limit(admin_write_rate_limit)
async def disable_card(
    request: Request,
    card_id: int = Path(),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> Message:
    await AdminService(db).disable_card(card_id)
    await audit(
        category="admin",
        action="disable_card",
        user_id=admin.id,
        resource_type="card",
        resource_id=card_id,
        ip=get_remote_address(request),
    )
    return Message(message="Card disabled")


@router.get("/summary", response_model=CardSummaryResponse)
async def get_card_summary(
    admin: User = Depends(get_admin_user),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
) -> CardSummaryResponse:
    data = await AdminService(db).get_card_summary()
    return CardSummaryResponse(**data)
