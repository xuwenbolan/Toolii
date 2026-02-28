from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, Request

from app.core.config import settings
from app.core.dependencies import get_current_user, get_db, get_verified_user
from app.core.rate_limiter import limiter
from app.models.share_link import ShareLink
from app.models.user import User
from app.schemas.share import (
    ShareCancelResponse,
    ShareClaimResponse,
    ShareCreateRequest,
    ShareCreateResponse,
    ShareInfoResponse,
    ShareLinkItem,
    ShareLinksResponse,
)
from app.services.share_service import ShareService

router = APIRouter(prefix=f"{settings.api_prefix}/share", tags=["share"])


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if getattr(value, "tzinfo", None) is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _effective_status(link: ShareLink) -> str:
    expires_at = _as_utc(link.expires_at)
    if link.status == "pending" and expires_at is not None:
        if expires_at <= datetime.now(timezone.utc):
            return "expired"
    return str(link.status)


def _to_item(link: ShareLink) -> ShareLinkItem:
    return ShareLinkItem(
        id=link.id,
        token=link.token,
        amount=link.amount,
        status=_effective_status(link),
        from_user_id=link.from_user_id,
        to_user_id=link.to_user_id,
        expires_at=_as_utc(link.expires_at),
        claimed_at=_as_utc(link.claimed_at),
        canceled_at=_as_utc(link.canceled_at),
        created_at=_as_utc(link.created_at),
    )


@router.post("/create", response_model=ShareCreateResponse)
@limiter.limit(settings.rate_limit_auth)
async def create_share(
    request: Request,  # noqa: ARG001
    payload: ShareCreateRequest,
    user: User = Depends(get_verified_user),
    db=Depends(get_db),
) -> ShareCreateResponse:
    service = ShareService(db)
    result = await service.create_share_link(user_id=user.id, amount=payload.amount)
    return ShareCreateResponse(
        link=_to_item(result.link),
        share_path=service.get_share_path(result.link.token),
        balance_after=result.balance_after,
    )


@router.post("/claim/{token}", response_model=ShareClaimResponse)
@limiter.limit(settings.rate_limit_auth)
async def claim_share(
    token: str,
    request: Request,  # noqa: ARG001
    user: User = Depends(get_current_user),
    db=Depends(get_db),
) -> ShareClaimResponse:
    result = await ShareService(db).claim(token=token, user_id=user.id)
    return ShareClaimResponse(
        code="SHARE_CLAIMED",
        message="Claimed successfully",
        amount=result.amount,
        balance=result.balance_after,
    )


@router.get("/info/{token}", response_model=ShareInfoResponse)
@limiter.limit(settings.rate_limit_anon)
async def share_info(
    token: str,
    request: Request,  # noqa: ARG001
    db=Depends(get_db),
) -> ShareInfoResponse:
    link = await ShareService(db).get_info(token=token)
    status = _effective_status(link)
    return ShareInfoResponse(
        token=link.token,
        amount=link.amount,
        status=status,
        expires_at=_as_utc(link.expires_at),
        claimed_at=_as_utc(link.claimed_at),
        canceled_at=_as_utc(link.canceled_at),
        created_at=_as_utc(link.created_at),
        can_claim=status == "pending",
    )


@router.get("/links", response_model=ShareLinksResponse)
@limiter.limit(settings.rate_limit_auth)
async def my_share_links(
    request: Request,  # noqa: ARG001
    user: User = Depends(get_current_user),
    db=Depends(get_db),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> ShareLinksResponse:
    result = await ShareService(db).list_links(user_id=user.id, limit=limit, offset=offset)
    return ShareLinksResponse(items=[_to_item(item) for item in result.items], total=result.total)


@router.delete("/{link_id}", response_model=ShareCancelResponse)
@limiter.limit(settings.rate_limit_auth)
async def cancel_share(
    link_id: int,
    request: Request,  # noqa: ARG001
    user: User = Depends(get_current_user),
    db=Depends(get_db),
) -> ShareCancelResponse:
    result = await ShareService(db).cancel(link_id=link_id, user_id=user.id)
    return ShareCancelResponse(code=result.code, message=result.message, balance=result.balance_after)
