from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import secrets

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError, ForbiddenError, NotFoundError
from app.models.share_link import ShareLink
from app.services.credit_service import CreditAddResult, CreditService


SHARE_LINK_TTL_HOURS = 24


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _is_expired(value: datetime | None) -> bool:
    if value is None:
        return False
    return _as_utc(value) <= _utcnow()


def _share_path(token: str) -> str:
    return f"/share/{token}"


@dataclass(slots=True)
class ShareCreateResult:
    link: ShareLink
    balance_after: int


@dataclass(slots=True)
class ShareClaimResult:
    link: ShareLink
    amount: int
    balance_after: int


@dataclass(slots=True)
class ShareCancelResult:
    link: ShareLink
    balance_after: int
    message: str


@dataclass(slots=True)
class ShareLinksListResult:
    items: list[ShareLink]
    total: int


class ShareService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._credits = CreditService(db)

    async def _generate_unique_token(self) -> str:
        for _ in range(8):
            token = secrets.token_urlsafe(18).replace("-", "").replace("_", "")[:28]
            result = await self._db.execute(select(ShareLink.id).where(ShareLink.token == token))
            if result.scalar_one_or_none() is None:
                return token
        raise AppError(code="SHARE_TOKEN_GENERATE_FAILED", message="生成分享链接失败", status_code=500)

    async def _get_link_by_token(self, token: str, *, for_update: bool = False) -> ShareLink:
        stmt = select(ShareLink).where(ShareLink.token == token)
        if for_update:
            stmt = stmt.with_for_update()
        result = await self._db.execute(stmt)
        link = result.scalar_one_or_none()
        if link is None:
            raise NotFoundError("分享链接不存在")
        return link

    async def _get_link_by_id(self, link_id: int, *, for_update: bool = False) -> ShareLink:
        stmt = select(ShareLink).where(ShareLink.id == link_id)
        if for_update:
            stmt = stmt.with_for_update()
        result = await self._db.execute(stmt)
        link = result.scalar_one_or_none()
        if link is None:
            raise NotFoundError("分享链接不存在")
        return link

    async def _refund_to_sender(
        self,
        *,
        link: ShareLink,
        tx_type: str,
        description: str,
    ) -> CreditAddResult:
        return await self._credits.add(
            user_id=link.from_user_id,
            amount=int(link.amount),
            tx_type=tx_type,
            description=description,
            reference_id=f"share:{link.id}",
            autocommit=False,
        )

    def get_share_path(self, token: str) -> str:
        return _share_path(token)

    async def create_share_link(self, *, user_id: int, amount: int) -> ShareCreateResult:
        if amount <= 0:
            raise AppError(code="INVALID_SHARE_AMOUNT", message="分享数量必须大于 0", status_code=400)
        if amount > 1000:
            raise AppError(code="INVALID_SHARE_AMOUNT", message="单次分享数量过大", status_code=400)

        try:
            token = await self._generate_unique_token()
            now = _utcnow()
            link = ShareLink(
                token=token,
                from_user_id=user_id,
                amount=int(amount),
                status="pending",
                expires_at=now + timedelta(hours=SHARE_LINK_TTL_HOURS),
            )
            self._db.add(link)
            await self._db.flush()

            consume_result = await self._credits.consume(
                user_id=user_id,
                amount=int(amount),
                tx_type="share_create",
                description="创建 Credits 分享链接（冻结）",
                reference_id=f"share:{link.id}",
                autocommit=False,
            )
            await self._db.commit()
            return ShareCreateResult(link=link, balance_after=consume_result.balance_after)
        except AppError:
            await self._db.rollback()
            raise
        except Exception as exc:  # noqa: BLE001
            await self._db.rollback()
            raise AppError(code="SHARE_CREATE_FAILED", message="创建分享链接失败", status_code=500) from exc

    async def get_info(self, *, token: str) -> ShareLink:
        return await self._get_link_by_token(token, for_update=False)

    async def list_links(self, *, user_id: int, limit: int = 50, offset: int = 0) -> ShareLinksListResult:
        limit = max(1, min(100, int(limit)))
        offset = max(0, int(offset))

        total_result = await self._db.execute(
            select(func.count()).select_from(ShareLink).where(ShareLink.from_user_id == user_id)
        )
        total = int(total_result.scalar_one() or 0)

        items_result = await self._db.execute(
            select(ShareLink)
            .where(ShareLink.from_user_id == user_id)
            .order_by(ShareLink.id.desc())
            .limit(limit)
            .offset(offset)
        )
        return ShareLinksListResult(items=list(items_result.scalars().all()), total=total)

    async def claim(self, *, token: str, user_id: int) -> ShareClaimResult:
        try:
            link = await self._get_link_by_token(token, for_update=True)
            if link.from_user_id == user_id:
                raise ForbiddenError("不能领取自己创建的分享")

            if link.status != "pending":
                raise AppError(code="SHARE_NOT_CLAIMABLE", message="该分享链接不可领取", status_code=409)

            if _is_expired(link.expires_at):
                link.status = "expired"
                await self._refund_to_sender(
                    link=link,
                    tx_type="share_expire_refund",
                    description="分享链接过期退回",
                )
                await self._db.commit()
                raise AppError(code="SHARE_EXPIRED", message="分享链接已过期", status_code=409)

            add_result = await self._credits.add(
                user_id=user_id,
                amount=int(link.amount),
                tx_type="share_claim",
                description="领取 Credits 分享",
                reference_id=f"share:{link.id}",
                autocommit=False,
            )
            link.status = "claimed"
            link.to_user_id = user_id
            link.claimed_at = _utcnow()
            await self._db.commit()

            return ShareClaimResult(link=link, amount=int(link.amount), balance_after=add_result.balance_after)
        except AppError:
            await self._db.rollback()
            raise
        except Exception as exc:  # noqa: BLE001
            await self._db.rollback()
            raise AppError(code="SHARE_CLAIM_FAILED", message="领取分享失败", status_code=500) from exc

    async def cancel(self, *, link_id: int, user_id: int) -> ShareCancelResult:
        try:
            link = await self._get_link_by_id(link_id, for_update=True)
            if link.from_user_id != user_id:
                raise ForbiddenError("无权取消该分享链接")

            if link.status != "pending":
                raise AppError(code="SHARE_NOT_CANCELABLE", message="该分享链接不可取消", status_code=409)

            if _is_expired(link.expires_at):
                link.status = "expired"
                refund = await self._refund_to_sender(
                    link=link,
                    tx_type="share_expire_refund",
                    description="分享链接过期退回",
                )
                await self._db.commit()
                return ShareCancelResult(link=link, balance_after=refund.balance_after, message="分享已过期，Credits 已退回")

            link.status = "canceled"
            link.canceled_at = _utcnow()
            refund = await self._refund_to_sender(
                link=link,
                tx_type="share_cancel_refund",
                description="取消分享链接退回",
            )
            await self._db.commit()
            return ShareCancelResult(link=link, balance_after=refund.balance_after, message="分享链接已取消，Credits 已退回")
        except AppError:
            await self._db.rollback()
            raise
        except Exception as exc:  # noqa: BLE001
            await self._db.rollback()
            raise AppError(code="SHARE_CANCEL_FAILED", message="取消分享失败", status_code=500) from exc

    async def expire_pending_links(self, *, limit: int = 500) -> int:
        now = _utcnow()
        try:
            result = await self._db.execute(
                select(ShareLink)
                .where(ShareLink.status == "pending", ShareLink.expires_at.is_not(None), ShareLink.expires_at <= now)
                .order_by(ShareLink.id.asc())
                .limit(max(1, min(int(limit), 5000)))
            )
            links = list(result.scalars().all())
            expired_count = 0
            for link in links:
                if link.status != "pending":
                    continue
                link.status = "expired"
                await self._refund_to_sender(
                    link=link,
                    tx_type="share_expire_refund",
                    description="分享链接过期退回",
                )
                expired_count += 1

            if expired_count > 0:
                await self._db.commit()
            return expired_count
        except AppError:
            await self._db.rollback()
            raise
        except Exception as exc:  # noqa: BLE001
            await self._db.rollback()
            raise AppError(code="SHARE_EXPIRE_JOB_FAILED", message="过期分享处理失败", status_code=500) from exc
