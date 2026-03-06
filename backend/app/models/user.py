from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)

    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="1")
    email_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="0")
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="0")

    tokens_revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Per-user hub overrides (NULL = use global default, 0 = unlimited)
    hub_quota_mb: Mapped[int | None] = mapped_column(Integer, nullable=True)
    hub_max_files: Mapped[int | None] = mapped_column(Integer, nullable=True)
    hub_max_retention_days: Mapped[int | None] = mapped_column(Integer, nullable=True)

