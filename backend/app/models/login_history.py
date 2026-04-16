from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class LoginHistory(TimestampMixin, Base):
    __tablename__ = "login_history"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_jti: Mapped[str | None] = mapped_column(
        String(64), nullable=True, index=True
    )
    refresh_jti: Mapped[str | None] = mapped_column(
        String(64), nullable=True, index=True
    )
