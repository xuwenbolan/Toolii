from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models.share_link import ShareLink
from app.models.user_credit import UserCredit
from app.services.share_service import ShareService


async def _balance(session_factory, user_id: int) -> int:
    async with session_factory() as db:
        wallet = (await db.execute(select(UserCredit).where(UserCredit.user_id == user_id))).scalar_one()
        return int(wallet.balance)


@pytest.mark.asyncio
async def test_share_service_create_and_claim(session_factory, create_user) -> None:
    sender = await create_user(email="share-sender@example.com", balance=10)
    receiver = await create_user(email="share-receiver@example.com", balance=1)

    async with session_factory() as db:
        service = ShareService(db)
        created = await service.create_share_link(user_id=sender.id, amount=3)
        token = created.link.token
        assert created.balance_after == 7

    async with session_factory() as db:
        service = ShareService(db)
        claimed = await service.claim(token=token, user_id=receiver.id)
        assert claimed.amount == 3
        assert claimed.balance_after == 4

    assert await _balance(session_factory, sender.id) == 7
    assert await _balance(session_factory, receiver.id) == 4


@pytest.mark.asyncio
async def test_share_service_cancel_and_expire_refund(session_factory, create_user) -> None:
    sender = await create_user(email="share-cancel@example.com", balance=5)

    async with session_factory() as db:
        service = ShareService(db)
        created = await service.create_share_link(user_id=sender.id, amount=2)
        cancelled = await service.cancel(link_id=created.link.id, user_id=sender.id)
        assert "refunded" in cancelled.message
        assert cancelled.balance_after == 5

    assert await _balance(session_factory, sender.id) == 5

    async with session_factory() as db:
        service = ShareService(db)
        created = await service.create_share_link(user_id=sender.id, amount=1)
        link = (
            await db.execute(select(ShareLink).where(ShareLink.id == created.link.id))
        ).scalar_one()
        link.expires_at = datetime.now(timezone.utc) - timedelta(minutes=2)
        await db.commit()

    async with session_factory() as db:
        service = ShareService(db)
        expired_count = await service.expire_pending_links(limit=50)
        assert expired_count >= 1

    assert await _balance(session_factory, sender.id) == 5
