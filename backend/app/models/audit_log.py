from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.models.base import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # Who performed the action
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Event classification: auth, user, admin, credit, share, transfer, tool, system
    category: Mapped[str] = mapped_column(String(30), nullable=False, index=True)

    # Specific action: login, register, toggle_user_status, adjust_credits, etc.
    action: Mapped[str] = mapped_column(String(60), nullable=False, index=True)

    # Whether the action succeeded
    success: Mapped[bool] = mapped_column(nullable=False, server_default="1")

    # Target resource info (e.g. "user", "card", "tool", "transfer")
    resource_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    resource_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Request context
    ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(300), nullable=True)

    # Freeform detail (JSON or plain text)
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True,
    )
