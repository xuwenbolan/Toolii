from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.core.exceptions import AppError
from app.models.card_code import CardCode
from app.models.credit_transaction import CreditTransaction
from app.models.user_credit import UserCredit
from app.services.credit_service import CreditService
from app.utils.hash_utils import sha256_hex


@pytest.mark.asyncio
async def test_credit_service_consume_and_insufficient(session_factory, create_user) -> None:
    user = await create_user(email="credit-consume@example.com", balance=2)

    async with session_factory() as db:
        service = CreditService(db)
        result = await service.consume(
            user_id=user.id,
            amount=1,
            tx_type="photo_export",
            description="test consume",
            reference_id="test:1",
        )
        assert result.balance_before == 2
        assert result.balance_after == 1

    async with session_factory() as db:
        service = CreditService(db)
        with pytest.raises(AppError) as excinfo:
            await service.consume(user_id=user.id, amount=2, tx_type="photo_export")
        assert excinfo.value.code == "INSUFFICIENT_CREDITS"

        wallet = (
            await db.execute(select(UserCredit).where(UserCredit.user_id == user.id))
        ).scalar_one()
        assert wallet.balance == 1


@pytest.mark.asyncio
async def test_credit_service_redeem_code_records_transaction(session_factory, create_user) -> None:
    user = await create_user(email="credit-redeem@example.com", balance=1)
    code = "TOOL-AAAA-BBBB-CCCC"

    async with session_factory() as db:
        db.add(
            CardCode(
                code_hash=sha256_hex(code),
                credits=5,
                card_type="promo",
                status="unused",
                expires_at=datetime.now(timezone.utc) + timedelta(days=1),
            )
        )
        await db.commit()

    async with session_factory() as db:
        service = CreditService(db)
        result = await service.redeem_code(user_id=user.id, plain_code=code)
        assert result.added_credits == 5
        assert result.balance_before == 1
        assert result.balance_after == 6

    async with session_factory() as db:
        txs = (
            await db.execute(
                select(CreditTransaction).where(CreditTransaction.user_id == user.id).order_by(CreditTransaction.id.asc())
            )
        ).scalars().all()
        assert len(txs) == 1
        assert txs[0].tx_type == "redeem"
        assert txs[0].amount == 5
