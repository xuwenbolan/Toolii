from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request

from app.core.config import settings
from app.core.dependencies import get_current_user, get_db
from app.core.rate_limiter import limiter
from app.models.user import User
from app.schemas.credit import (
    CreditBalanceResponse,
    CreditTransactionItem,
    CreditTransactionsResponse,
    RedeemRequest,
    RedeemResponse,
)
from app.services.credit_service import CreditService

router = APIRouter(prefix=f"{settings.api_prefix}/credits", tags=["credits"])


@router.post("/redeem", response_model=RedeemResponse)
@limiter.limit(settings.rate_limit_auth)
async def redeem(
    request: Request,  # noqa: ARG001
    payload: RedeemRequest,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
) -> RedeemResponse:
    result = await CreditService(db).redeem_code(user_id=user.id, plain_code=payload.code)
    return RedeemResponse(
        added_credits=result.added_credits,
        balance=result.balance_after,
        card_type=result.card_type,
    )


@router.get("/balance", response_model=CreditBalanceResponse)
@limiter.limit(settings.rate_limit_auth)
async def get_balance(
    request: Request,  # noqa: ARG001
    user: User = Depends(get_current_user),
    db=Depends(get_db),
) -> CreditBalanceResponse:
    balance = await CreditService(db).get_balance(user_id=user.id)
    return CreditBalanceResponse(balance=balance)


@router.get("/transactions", response_model=CreditTransactionsResponse)
@limiter.limit(settings.rate_limit_auth)
async def get_transactions(
    request: Request,  # noqa: ARG001
    user: User = Depends(get_current_user),
    db=Depends(get_db),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> CreditTransactionsResponse:
    result = await CreditService(db).list_transactions(
        user_id=user.id,
        limit=limit,
        offset=offset,
    )
    return CreditTransactionsResponse(
        items=[
            CreditTransactionItem(
                id=item.id,
                tx_type=item.tx_type,
                amount=item.amount,
                balance_before=item.balance_before,
                balance_after=item.balance_after,
                description=item.description,
                reference_id=item.reference_id,
                created_at=item.created_at,
            )
            for item in result.items
        ],
        total=result.total,
        limit=result.limit,
        offset=result.offset,
    )
