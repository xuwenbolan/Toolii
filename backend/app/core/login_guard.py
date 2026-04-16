from __future__ import annotations

import logging
import math
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.models.login_attempt import LoginAttempt

logger = logging.getLogger(__name__)

_MAX_ATTEMPTS = 5
_WINDOW_SECONDS = 300       # 5 minutes
_LOCKOUT_SECONDS = 900      # 15 minutes


class LoginGuard:
    """DB-backed lockout for failed login attempts.

    State is persisted in the ``login_attempts`` table so that lockouts
    survive process restarts and are shared across worker processes.
    Lookups are keyed on the lowercase email so callers never depend on
    in-memory state.
    """

    def __init__(
        self,
        *,
        max_attempts: int = _MAX_ATTEMPTS,
        window_seconds: int = _WINDOW_SECONDS,
        lockout_seconds: int = _LOCKOUT_SECONDS,
    ) -> None:
        self._max_attempts = max_attempts
        self._window = timedelta(seconds=window_seconds)
        self._lockout = timedelta(seconds=lockout_seconds)

    @staticmethod
    def _key(email: str) -> str:
        return email.strip().lower()

    @staticmethod
    def _as_utc(dt: datetime | None) -> datetime | None:
        """Normalize to tz-aware UTC.

        SQLite does not preserve timezone information, so values loaded
        back from ``DateTime(timezone=True)`` columns arrive as naive
        datetimes. Treat those as UTC to keep arithmetic consistent
        across SQLite and PostgreSQL.
        """
        if dt is None:
            return None
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt

    async def check(self, db: AsyncSession, email: str) -> None:
        """Raise if *email* is currently locked out."""
        key = self._key(email)
        rec = await db.scalar(
            select(LoginAttempt).where(LoginAttempt.email == key)
        )
        if rec is None:
            return
        now = datetime.now(timezone.utc)
        first_failure = self._as_utc(rec.first_failure_at)
        locked_until = self._as_utc(rec.locked_until)
        if locked_until is not None and locked_until > now:
            remaining_minutes = max(1, math.ceil((locked_until - now).total_seconds() / 60))
            raise AppError(
                code="ACCOUNT_LOCKED",
                message=f"Too many failed attempts. Try again in {remaining_minutes} minute(s).",
                status_code=429,
            )
        # Drop expired window records on the read path so stale rows don't
        # accumulate between scheduler runs.
        if first_failure + self._window < now and (
            locked_until is None or locked_until <= now
        ):
            await db.delete(rec)
            await db.flush()

    async def record_failure(self, db: AsyncSession, email: str) -> None:
        """Record a failed login attempt. Lock the account if threshold exceeded."""
        key = self._key(email)
        now = datetime.now(timezone.utc)
        rec = await db.scalar(
            select(LoginAttempt).where(LoginAttempt.email == key)
        )
        if rec is None or self._as_utc(rec.first_failure_at) + self._window < now:
            # New window: either first-ever failure or previous window expired.
            if rec is not None:
                rec.failure_count = 1
                rec.first_failure_at = now
                rec.locked_until = None
            else:
                rec = LoginAttempt(
                    email=key,
                    failure_count=1,
                    first_failure_at=now,
                    locked_until=None,
                )
                db.add(rec)
        else:
            rec.failure_count += 1
            if rec.failure_count >= self._max_attempts:
                rec.locked_until = now + self._lockout
        await db.commit()

    async def record_success(self, db: AsyncSession, email: str) -> None:
        """Clear failure record on successful login."""
        key = self._key(email)
        await db.execute(delete(LoginAttempt).where(LoginAttempt.email == key))
        await db.commit()

    async def cleanup_expired(self, db: AsyncSession) -> None:
        """Delete rows whose failure window and lockout have both expired."""
        now = datetime.now(timezone.utc)
        window_cutoff = now - self._window
        result = await db.execute(
            delete(LoginAttempt).where(
                LoginAttempt.first_failure_at < window_cutoff,
                (LoginAttempt.locked_until.is_(None))
                | (LoginAttempt.locked_until <= now),
            )
        )
        await db.commit()
        if result.rowcount:
            logger.debug("Cleaned up %d expired login_attempts rows", result.rowcount)


login_guard = LoginGuard()
