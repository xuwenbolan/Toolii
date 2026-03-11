from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

import logging

from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

from app.core.exceptions import AppError
from app.utils.time_utils import utcnow
from app.models.card_code import CardCode
from app.models.credit_transaction import CreditTransaction
from app.models.user_credit import UserCredit
from app.utils.hash_utils import sha256_hex


def _is_expired(value: datetime | None) -> bool:
    if value is None:
        return False
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc) <= utcnow()
    return value <= utcnow()


@dataclass(slots=True)
class CreditConsumeResult:
    transaction_id: int
    user_id: int
    amount: int
    balance_before: int
    balance_after: int


@dataclass(slots=True)
class CreditAddResult:
    transaction_id: int
    user_id: int
    amount: int
    balance_before: int
    balance_after: int


@dataclass(slots=True)
class CreditRedeemResult:
    transaction_id: int
    user_id: int
    added_credits: int
    balance_before: int
    balance_after: int
    card_type: str


@dataclass(slots=True)
class CreditTransactionListResult:
    items: list[CreditTransaction]
    total: int
    limit: int
    offset: int


class CreditService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def _get_or_create_wallet(self, *, user_id: int, for_update: bool = False) -> UserCredit:
        stmt = select(UserCredit).where(UserCredit.user_id == user_id)
        if for_update:
            stmt = stmt.with_for_update()
        result = await self._db.execute(stmt)
        wallet = result.scalar_one_or_none()
        if wallet is None:
            wallet = UserCredit(user_id=user_id, balance=0)
            self._db.add(wallet)
            await self._db.flush()
        return wallet

    async def _record_tx(
        self,
        *,
        user_id: int,
        tx_type: str,
        amount_delta: int,
        balance_before: int,
        balance_after: int,
        description: str | None,
        reference_id: str | None,
    ) -> CreditTransaction:
        tx = CreditTransaction(
            user_id=user_id,
            tx_type=tx_type.strip(),
            amount=int(amount_delta),
            balance_before=balance_before,
            balance_after=balance_after,
            description=description.strip() if description else None,
            reference_id=reference_id.strip() if reference_id else None,
        )
        self._db.add(tx)
        await self._db.flush()
        return tx

    async def _apply_delta(
        self,
        *,
        user_id: int,
        amount_delta: int,
        tx_type: str,
        description: str | None = None,
        reference_id: str | None = None,
    ) -> tuple[CreditTransaction, int, int]:
        """Apply a credit delta. Does NOT commit — caller must manage the transaction."""
        if amount_delta == 0:
            raise AppError(code="INVALID_CREDIT_AMOUNT", message="Credit change amount cannot be 0", status_code=400)
        if not tx_type.strip():
            raise AppError(code="INVALID_TX_TYPE", message="Transaction type cannot be empty", status_code=400)

        wallet = await self._get_or_create_wallet(user_id=user_id, for_update=True)
        balance_before = int(wallet.balance)
        balance_after = balance_before + int(amount_delta)
        if balance_after < 0:
            raise AppError(code="INSUFFICIENT_CREDITS", message="Insufficient credits", status_code=402)
        wallet.balance = balance_after
        tx = await self._record_tx(
            user_id=user_id,
            tx_type=tx_type,
            amount_delta=amount_delta,
            balance_before=balance_before,
            balance_after=balance_after,
            description=description,
            reference_id=reference_id,
        )
        return tx, balance_before, balance_after

    async def get_balance(self, *, user_id: int) -> int:
        result = await self._db.execute(select(UserCredit).where(UserCredit.user_id == user_id))
        wallet = result.scalar_one_or_none()
        if wallet is None:
            return 0
        return int(wallet.balance)

    async def has_transaction(self, *, user_id: int, reference_id: str) -> bool:
        """Check if a transaction with the given reference_id exists for this user."""
        result = await self._db.execute(
            select(func.count())
            .select_from(CreditTransaction)
            .where(
                CreditTransaction.user_id == user_id,
                CreditTransaction.reference_id == reference_id,
            )
        )
        return int(result.scalar_one() or 0) > 0

    async def list_transactions(
        self,
        *,
        user_id: int,
        limit: int = 20,
        offset: int = 0,
    ) -> CreditTransactionListResult:
        if limit < 1 or limit > 100:
            raise AppError(code="INVALID_LIMIT", message="limit must be between 1 and 100", status_code=400)
        if offset < 0:
            raise AppError(code="INVALID_OFFSET", message="offset must not be negative", status_code=400)

        total_result = await self._db.execute(
            select(func.count())
            .select_from(CreditTransaction)
            .where(CreditTransaction.user_id == user_id)
        )
        total = int(total_result.scalar_one() or 0)

        items_result = await self._db.execute(
            select(CreditTransaction)
            .where(CreditTransaction.user_id == user_id)
            .order_by(CreditTransaction.id.desc())
            .limit(limit)
            .offset(offset)
        )
        items = list(items_result.scalars().all())
        return CreditTransactionListResult(items=items, total=total, limit=limit, offset=offset)

    async def add(
        self,
        *,
        user_id: int,
        amount: int,
        tx_type: str,
        description: str | None = None,
        reference_id: str | None = None,
        autocommit: bool = True,
    ) -> CreditAddResult:
        if amount <= 0:
            raise AppError(code="INVALID_CREDIT_AMOUNT", message="Amount to add must be greater than 0", status_code=400)
        tx, balance_before, balance_after = await self._apply_delta(
            user_id=user_id,
            amount_delta=int(amount),
            tx_type=tx_type,
            description=description,
            reference_id=reference_id,
        )
        if autocommit:
            await self._db.commit()
        return CreditAddResult(
            transaction_id=int(tx.id),
            user_id=user_id,
            amount=int(amount),
            balance_before=balance_before,
            balance_after=balance_after,
        )

    async def consume(
        self,
        *,
        user_id: int,
        amount: int,
        tx_type: str,
        description: str | None = None,
        reference_id: str | None = None,
        autocommit: bool = True,
    ) -> CreditConsumeResult:
        if amount <= 0:
            raise AppError(code="INVALID_CREDIT_AMOUNT", message="Amount to consume must be greater than 0", status_code=400)
        tx, balance_before, balance_after = await self._apply_delta(
            user_id=user_id,
            amount_delta=-int(amount),
            tx_type=tx_type,
            description=description,
            reference_id=reference_id,
        )
        if autocommit:
            await self._db.commit()
        return CreditConsumeResult(
            transaction_id=int(tx.id),
            user_id=user_id,
            amount=int(amount),
            balance_before=balance_before,
            balance_after=balance_after,
        )

    async def redeem_code(
        self,
        *,
        user_id: int,
        plain_code: str,
    ) -> CreditRedeemResult:
        code = plain_code.strip().upper()
        if not code:
            raise AppError(code="INVALID_CARD_CODE", message="Card code cannot be empty", status_code=400)

        code_hash = sha256_hex(code)

        try:
            stmt = select(CardCode).where(CardCode.code_hash == code_hash).with_for_update()
            result = await self._db.execute(stmt)
            card = result.scalar_one_or_none()
            if card is None:
                raise AppError(code="INVALID_CARD_CODE", message="Invalid card code", status_code=400)
            if card.status != "unused":
                raise AppError(code="CARD_CODE_USED", message="Card code already used", status_code=409)
            if _is_expired(card.expires_at):
                card.status = "expired"
                await self._db.commit()
                raise AppError(code="CARD_CODE_EXPIRED", message="Card code expired", status_code=400)

            card.status = "redeemed"
            card.redeemed_by_user_id = user_id
            card.redeemed_at = utcnow()

            tx, balance_before, balance_after = await self._apply_delta(
                user_id=user_id,
                amount_delta=int(card.credits),
                tx_type="redeem",
                description=f"Card redemption ({card.card_type})",
                reference_id=f"card-redeem:{card.id}",
            )
            await self._db.commit()

            return CreditRedeemResult(
                transaction_id=int(tx.id),
                user_id=user_id,
                added_credits=int(card.credits),
                balance_before=balance_before,
                balance_after=balance_after,
                card_type=card.card_type,
            )
        except AppError:
            await self._db.rollback()
            raise
        except SQLAlchemyError as exc:
            await self._db.rollback()
            logger.exception("Card redeem failed for user %s", user_id)
            raise AppError(code="CARD_REDEEM_FAILED", message="Card redemption failed", status_code=500) from exc
