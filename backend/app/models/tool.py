"""Tool configuration model for dynamic tool management."""

from __future__ import annotations

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Tool(TimestampMixin, Base):
    __tablename__ = "tools"

    tool_name: Mapped[str] = mapped_column(String(50), primary_key=True)
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0)

    # Enable/disable
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    # Pricing
    credit_cost: Mapped[int] = mapped_column(Integer, default=0)

    # Metadata (nullable -- falls back to i18n keys if null)
    display_name_zh: Mapped[str | None] = mapped_column(String(100), nullable=True)
    display_name_en: Mapped[str | None] = mapped_column(String(100), nullable=True)
    description_zh: Mapped[str | None] = mapped_column(String(500), nullable=True)
    description_en: Mapped[str | None] = mapped_column(String(500), nullable=True)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Access control: "public" | "auth" | "verified" | "admin"
    access_level: Mapped[str] = mapped_column(String(20), default="public")

    # Usage limits (null = unlimited)
    daily_limit_anon: Mapped[int | None] = mapped_column(Integer, nullable=True)
    daily_limit_auth: Mapped[int | None] = mapped_column(Integer, nullable=True)
