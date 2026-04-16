from __future__ import annotations

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ProcessingHistory(TimestampMixin, Base):
    __tablename__ = "processing_history"
    __table_args__ = (
        Index("ix_processing_history_user_created", "user_id", "created_at"),
        Index("ix_processing_history_tool_user_created", "tool_name", "user_id", "created_at"),
        Index("ix_processing_history_tool_ip_created", "tool_name", "ip", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    tool_name: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="done")

    ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(256), nullable=True)

    input_file_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    output_file_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

