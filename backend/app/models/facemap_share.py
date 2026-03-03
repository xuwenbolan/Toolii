from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class FaceMapShare(TimestampMixin, Base):
    __tablename__ = "facemap_shares"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    token: Mapped[str] = mapped_column(
        String(32), unique=True, index=True, nullable=False
    )

    # Full FaceProfileResponse or FullReportResponse JSON
    result_json: Mapped[str] = mapped_column(Text, nullable=False)

    # UUID hex from FileService (32 chars) for the compressed photo
    image_file_id: Mapped[str] = mapped_column(String(32), nullable=False)

    # "profile", "report", or "similarity"
    share_type: Mapped[str] = mapped_column(String(20), nullable=False)

    # Locale used during analysis ("en" or "zh-CN")
    locale: Mapped[str] = mapped_column(
        String(10), nullable=False, server_default="zh-CN"
    )

    # SHA-256 of share_type + result_json for deduplication
    content_hash: Mapped[str | None] = mapped_column(
        String(64), nullable=True, index=True
    )

    # Nullable — free users may not be logged in
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
