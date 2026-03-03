from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class TransferStatus:
    ACTIVE = "active"
    EXPIRED = "expired"
    BURNED = "burned"
    DELETED = "deleted"


class FileTransfer(TimestampMixin, Base):
    __tablename__ = "file_transfers"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # 8-char alphanumeric short link token
    token: Mapped[str] = mapped_column(
        String(16), unique=True, index=True, nullable=False
    )

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )

    # Optional 4-digit extraction code, plaintext
    extract_code: Mapped[str | None] = mapped_column(String(4), nullable=True)

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )

    # null = unlimited
    max_downloads: Mapped[int | None] = mapped_column(Integer, nullable=True)

    download_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )

    # active / expired / deleted
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="active"
    )

    # Brute-force protection for extract code
    failed_code_attempts: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )

    total_size: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )

    file_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )

    # Auto-delete files after first download
    burn_after_read: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="0"
    )

    message: Mapped[str | None] = mapped_column(Text, nullable=True)

    files: Mapped[list[TransferFile]] = relationship(
        "TransferFile", back_populates="transfer", cascade="all, delete-orphan"
    )


class TransferFile(Base):
    __tablename__ = "transfer_files"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    transfer_id: Mapped[int] = mapped_column(
        ForeignKey("file_transfers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # UUID hex from FileService (32 chars)
    file_id: Mapped[str] = mapped_column(String(32), nullable=False)

    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    content_type: Mapped[str] = mapped_column(String(128), nullable=False)

    transfer: Mapped[FileTransfer] = relationship(
        "FileTransfer", back_populates="files"
    )
