from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.models.card_code import CardCode
from app.models.credit_transaction import CreditTransaction
from app.models.user_credit import UserCredit
from app.utils.hash_utils import sha256_hex


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _is_expired(value: datetime | None) -> bool:
    if value is None:
        return False
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc) <= _utcnow()
    return value <= _utcnow()


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
        autocommit: bool = True,
    ) -> tuple[CreditTransaction, int, int]:
        if amount_delta == 0:
            raise AppError(code="INVALID_CREDIT_AMOUNT", message="Credits 变更数量不能为 0", status_code=400)
        if not tx_type.strip():
            raise AppError(code="INVALID_TX_TYPE", message="交易类型不能为空", status_code=400)

        async def _run() -> tuple[CreditTransaction, int, int]:
            wallet = await self._get_or_create_wallet(user_id=user_id, for_update=True)
            balance_before = int(wallet.balance)
            balance_after = balance_before + int(amount_delta)
            if balance_after < 0:
                raise AppError(code="INSUFFICIENT_CREDITS", message="Credits 余额不足", status_code=402)
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
            if autocommit:
                await self._db.commit()
            return tx, balance_before, balance_after

        if not autocommit:
            return await _run()

        try:
            return await _run()
        except AppError:
            await self._db.rollback()
            raise
        except Exception as exc:  # noqa: BLE001
            await self._db.rollback()
            raise AppError(code="CREDIT_CHANGE_FAILED", message="Credits 余额变更失败", status_code=500) from exc

    async def get_balance(self, *, user_id: int) -> int:
        result = await self._db.execute(select(UserCredit).where(UserCredit.user_id == user_id))
        wallet = result.scalar_one_or_none()
        if wallet is None:
            return 0
        return int(wallet.balance)

    async def list_transactions(
        self,
        *,
        user_id: int,
        limit: int = 20,
        offset: int = 0,
    ) -> CreditTransactionListResult:
        if limit < 1 or limit > 100:
            raise AppError(code="INVALID_LIMIT", message="limit 必须在 1-100 之间", status_code=400)
        if offset < 0:
            raise AppError(code="INVALID_OFFSET", message="offset 不能小于 0", status_code=400)

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
            raise AppError(code="INVALID_CREDIT_AMOUNT", message="增加数量必须大于 0", status_code=400)
        try:
            tx, balance_before, balance_after = await self._apply_delta(
                user_id=user_id,
                amount_delta=int(amount),
                tx_type=tx_type,
                description=description,
                reference_id=reference_id,
                autocommit=autocommit,
            )
            return CreditAddResult(
                transaction_id=int(tx.id),
                user_id=user_id,
                amount=int(amount),
                balance_before=balance_before,
                balance_after=balance_after,
            )
        except AppError:
            if autocommit:
                raise
            raise
        except Exception as exc:  # noqa: BLE001
            if autocommit:
                raise AppError(code="CREDIT_ADD_FAILED", message="余额增加失败", status_code=500) from exc
            raise

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
            raise AppError(code="INVALID_CREDIT_AMOUNT", message="扣费数量必须大于 0", status_code=400)
        try:
            tx, balance_before, balance_after = await self._apply_delta(
                user_id=user_id,
                amount_delta=-int(amount),
                tx_type=tx_type,
                description=description,
                reference_id=reference_id,
                autocommit=autocommit,
            )
            return CreditConsumeResult(
                transaction_id=int(tx.id),
                user_id=user_id,
                amount=int(amount),
                balance_before=balance_before,
                balance_after=balance_after,
            )
        except AppError:
            if autocommit:
                raise
            raise
        except Exception as exc:  # noqa: BLE001
            if autocommit:
                raise AppError(code="CREDIT_CONSUME_FAILED", message="余额扣费失败", status_code=500) from exc
            raise

    async def redeem_code(
        self,
        *,
        user_id: int,
        plain_code: str,
    ) -> CreditRedeemResult:
        code = plain_code.strip().upper()
        if not code:
            raise AppError(code="INVALID_CARD_CODE", message="卡密不能为空", status_code=400)

        code_hash = sha256_hex(code)

        try:
            stmt = select(CardCode).where(CardCode.code_hash == code_hash).with_for_update()
            result = await self._db.execute(stmt)
            card = result.scalar_one_or_none()
            if card is None:
                raise AppError(code="INVALID_CARD_CODE", message="卡密无效", status_code=400)
            if card.status != "unused":
                raise AppError(code="CARD_CODE_USED", message="卡密已被使用", status_code=409)
            if _is_expired(card.expires_at):
                card.status = "expired"
                await self._db.commit()
                raise AppError(code="CARD_CODE_EXPIRED", message="卡密已过期", status_code=400)

            card.status = "redeemed"
            card.redeemed_by_user_id = user_id
            card.redeemed_at = _utcnow()

            added = await self.add(
                user_id=user_id,
                amount=int(card.credits),
                tx_type="redeem",
                description=f"卡密兑换（{card.card_type}）",
                reference_id=f"card-redeem:{card.id}",
                autocommit=False,
            )
            await self._db.commit()

            return CreditRedeemResult(
                transaction_id=added.transaction_id,
                user_id=user_id,
                added_credits=int(card.credits),
                balance_before=added.balance_before,
                balance_after=added.balance_after,
                card_type=card.card_type,
            )
        except AppError:
            await self._db.rollback()
            raise
        except Exception as exc:  # noqa: BLE001
            await self._db.rollback()
            raise AppError(code="CARD_REDEEM_FAILED", message="卡密兑换失败", status_code=500) from exc
