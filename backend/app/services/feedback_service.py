from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.feedback import Feedback
from app.models.user import User


class FeedbackService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(self, user_id: int, category: str, content: str) -> Feedback:
        fb = Feedback(user_id=user_id, category=category, content=content)
        self.db.add(fb)
        await self.db.commit()
        await self.db.refresh(fb)
        return fb

    async def list_by_user(
        self, user_id: int, *, offset: int = 0, limit: int = 20
    ) -> tuple[list[Feedback], int]:
        base = select(Feedback).where(Feedback.user_id == user_id)
        total = await self.db.scalar(select(func.count()).select_from(base.subquery()))
        rows = await self.db.scalars(
            base.order_by(Feedback.created_at.desc()).offset(offset).limit(limit)
        )
        return list(rows), total or 0

    async def list_all(
        self, *, status: str | None = None, offset: int = 0, limit: int = 20
    ) -> tuple[list[dict], int]:
        base = select(Feedback, User.email, User.name).join(User, Feedback.user_id == User.id)
        if status:
            base = base.where(Feedback.status == status)

        count_q = select(func.count()).select_from(base.subquery())
        total = await self.db.scalar(count_q) or 0

        q = base.order_by(Feedback.created_at.desc()).offset(offset).limit(limit)
        result = await self.db.execute(q)
        items = []
        for fb, email, name in result.all():
            items.append(
                {
                    "id": fb.id,
                    "user_id": fb.user_id,
                    "user_email": email,
                    "user_name": name,
                    "category": fb.category,
                    "content": fb.content,
                    "status": fb.status,
                    "admin_note": fb.admin_note,
                    "created_at": fb.created_at,
                }
            )
        return items, total

    async def update(
        self, feedback_id: int, *, status: str | None = None, admin_note: str | None = None
    ) -> Feedback:
        fb = await self.db.get(Feedback, feedback_id)
        if not fb:
            raise NotFoundError("Feedback not found")
        if status is not None:
            fb.status = status
        if admin_note is not None:
            fb.admin_note = admin_note
        await self.db.commit()
        await self.db.refresh(fb)
        return fb
