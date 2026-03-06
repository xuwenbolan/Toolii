from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class FileSource:
    UPLOAD = "upload"
    TOOL_RESULT = "tool_result"
    RESULT_SHARE = "result_share"


class FileStatus:
    ACTIVE = "active"
    EXPIRED = "expired"
    DELETED = "deleted"


class UserFile(TimestampMixin, Base):
    __tablename__ = "user_files"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )

    # FileService storage UUID (32-char hex)
    file_id: Mapped[str] = mapped_column(String(32), nullable=False)

    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    content_type: Mapped[str] = mapped_column(String(128), nullable=False)

    # upload / tool_result / result_share
    source: Mapped[str] = mapped_column(String(20), nullable=False)

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )

    # active / expired / deleted
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="active"
    )

    # Optional JSON for tool-specific metadata (e.g. clean_file_id, credit_cost)
    meta: Mapped[str | None] = mapped_column(Text, nullable=True)


class ShareGroupStatus:
    ACTIVE = "active"
    EXPIRED = "expired"
    DELETED = "deleted"


class ShareGroup(TimestampMixin, Base):
    __tablename__ = "share_groups"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )

    # 8-char alphanumeric short link token
    token: Mapped[str] = mapped_column(
        String(16), unique=True, index=True, nullable=False
    )

    # 6-char server-generated extract code
    extract_code: Mapped[str | None] = mapped_column(String(6), nullable=True)

    message: Mapped[str | None] = mapped_column(String(500), nullable=True)

    download_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )

    failed_code_attempts: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )

    # Denormalized: MIN(user_files.expires_at) of linked files
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )

    # active / expired / deleted
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="active"
    )


class ShareGroupFile(Base):
    __tablename__ = "share_group_files"
    __table_args__ = (
        UniqueConstraint("share_group_id", "user_file_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    share_group_id: Mapped[int] = mapped_column(
        ForeignKey("share_groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    user_file_id: Mapped[int] = mapped_column(
        ForeignKey("user_files.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
