from __future__ import annotations

import secrets
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError, NotFoundError
from app.models.card_code import CardCode
from app.models.user import User
from app.utils.hash_utils import sha256_hex
from app.utils.time_utils import utcnow

CARD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


class AdminCardService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_cards(
        self,
        *,
        limit: int = 20,
        offset: int = 0,
        status: str | None = None,
        card_type: str | None = None,
    ) -> dict:
        base = select(CardCode)
        count_base = select(func.count()).select_from(CardCode)

        if status:
            base = base.where(CardCode.status == status)
            count_base = count_base.where(CardCode.status == status)
        if card_type:
            base = base.where(CardCode.card_type == card_type)
            count_base = count_base.where(CardCode.card_type == card_type)

        total = int((await self._db.execute(count_base)).scalar_one())
        cards = (await self._db.execute(
            base.order_by(CardCode.id.desc()).limit(limit).offset(offset)
        )).scalars().all()

        # Batch-load redeemer emails
        redeemer_ids = [c.redeemed_by_user_id for c in cards if c.redeemed_by_user_id]
        emails: dict[int, str] = {}
        if redeemer_ids:
            rows = (await self._db.execute(
                select(User.id, User.email).where(User.id.in_(redeemer_ids))
            )).all()
            emails = {r[0]: r[1] for r in rows}

        items = [
            {
                "id": c.id,
                "credits": c.credits,
                "card_type": c.card_type,
                "status": c.status,
                "redeemed_by_user_id": c.redeemed_by_user_id,
                "redeemed_by_email": emails.get(c.redeemed_by_user_id) if c.redeemed_by_user_id else None,
                "expires_at": c.expires_at,
                "redeemed_at": c.redeemed_at,
                "created_at": c.created_at,
            }
            for c in cards
        ]
        return {"items": items, "total": total, "limit": limit, "offset": offset}

    async def generate_cards(
        self,
        *,
        count: int,
        credits: int,
        card_type: str,
        prefix: str,
        expires_days: int | None,
    ) -> list[str]:
        expires_at = None
        if expires_days is not None:
            expires_at = utcnow() + timedelta(days=expires_days)

        codes: list[str] = []
        seen_hashes: set[str] = set()
        while len(codes) < count:
            parts = ["".join(secrets.choice(CARD_ALPHABET) for _ in range(4)) for _ in range(3)]
            plain = f"{prefix}-" + "-".join(parts)
            code_hash = sha256_hex(plain)
            if code_hash in seen_hashes:
                continue
            seen_hashes.add(code_hash)
            codes.append(plain)

        for plain in codes:
            self._db.add(
                CardCode(
                    code_hash=sha256_hex(plain),
                    credits=credits,
                    card_type=card_type,
                    status="unused",
                    expires_at=expires_at,
                )
            )
        await self._db.flush()
        await self._db.commit()
        return codes

    async def disable_card(self, card_id: int) -> None:
        result = await self._db.execute(
            select(CardCode).where(CardCode.id == card_id)
        )
        card = result.scalar_one_or_none()
        if card is None:
            raise NotFoundError("Card not found")
        if card.status != "unused":
            raise AppError(
                code="CARD_NOT_UNUSED",
                message="Only unused cards can be disabled",
                status_code=400,
            )
        card.status = "disabled"
        await self._db.commit()

    async def get_card_summary(self) -> dict:
        # Status counts
        rows = (await self._db.execute(
            select(CardCode.status, func.count().label("cnt"))
            .group_by(CardCode.status)
        )).all()
        status_counts = [{"status": r[0], "count": r[1]} for r in rows]

        # Total credits issued vs redeemed
        total_issued = int(
            (await self._db.execute(
                select(func.coalesce(func.sum(CardCode.credits), 0))
            )).scalar_one()
        )
        total_redeemed = int(
            (await self._db.execute(
                select(func.coalesce(func.sum(CardCode.credits), 0))
                .where(CardCode.status == "redeemed")
            )).scalar_one()
        )

        return {
            "status_counts": status_counts,
            "total_credits_issued": total_issued,
            "total_credits_redeemed": total_redeemed,
        }
