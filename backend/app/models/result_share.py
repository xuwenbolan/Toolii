from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ResultShare(TimestampMixin, Base):
    __tablename__ = "result_shares"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    token: Mapped[str] = mapped_column(
        String(32), unique=True, index=True, nullable=False
    )

    # Structured result JSON (analysis data or tool metadata)
    result_json: Mapped[str] = mapped_column(Text, nullable=False)

    # UUID hex from FileService (32 chars) — main result image
    image_file_id: Mapped[str] = mapped_column(String(32), nullable=False)

    # UUID hex — original "before" image for before/after tools (nullable)
    original_image_file_id: Mapped[str | None] = mapped_column(
        String(32), nullable=True
    )

    # Share type identifier (e.g. "profile", "similarity", "colorize", "compress")
    share_type: Mapped[str] = mapped_column(String(20), nullable=False)

    # Locale used during creation ("en" or "zh-CN")
    locale: Mapped[str] = mapped_column(
        String(10), nullable=False, server_default="zh-CN"
    )

    # SHA-256 of share_type + result_json for deduplication
    content_hash: Mapped[str | None] = mapped_column(
        String(64), nullable=True, index=True
    )

    # Nullable — free/anonymous users may not be logged in
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
