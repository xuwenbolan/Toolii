from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class LoginAttempt(Base):
    """Persistent record of failed login attempts per lowercase email.

    One row per email. Rows are upserted on every failed login and
    deleted on success or by the scheduler cleanup job. Because the row
    survives restarts, lockouts are enforced consistently across process
    restarts and workers.
    """

    __tablename__ = "login_attempts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    failure_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    first_failure_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
