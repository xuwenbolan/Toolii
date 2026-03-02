from __future__ import annotations

import math
import time
from dataclasses import dataclass

from app.core.exceptions import AppError

_MAX_ATTEMPTS = 5
_WINDOW_SECONDS = 300       # 5 minutes
_LOCKOUT_SECONDS = 900      # 15 minutes


@dataclass
class _FailureRecord:
    count: int = 0
    first_failure: float = 0.0
    locked_until: float = 0.0


class LoginGuard:
    """Track failed login attempts per email and enforce temporary lockout."""

    def __init__(
        self,
        *,
        max_attempts: int = _MAX_ATTEMPTS,
        window_seconds: int = _WINDOW_SECONDS,
        lockout_seconds: int = _LOCKOUT_SECONDS,
    ) -> None:
        self._max_attempts = max_attempts
        self._window = window_seconds
        self._lockout = lockout_seconds
        self._records: dict[str, _FailureRecord] = {}

    def check(self, email: str) -> None:
        """Raise if *email* is currently locked out."""
        key = email.strip().lower()
        rec = self._records.get(key)
        if rec is None:
            return
        now = time.monotonic()
        if rec.locked_until > now:
            remaining_minutes = math.ceil((rec.locked_until - now) / 60)
            raise AppError(
                code="ACCOUNT_LOCKED",
                message=f"Too many failed attempts. Try again in {remaining_minutes} minute(s).",
                status_code=429,
            )
        # Reset if window expired
        if now - rec.first_failure > self._window:
            del self._records[key]

    def record_failure(self, email: str) -> None:
        """Record a failed login. Lock the account if threshold exceeded."""
        key = email.strip().lower()
        now = time.monotonic()
        rec = self._records.get(key)
        if rec is None or (now - rec.first_failure > self._window):
            rec = _FailureRecord(count=0, first_failure=now)
            self._records[key] = rec
        rec.count += 1
        if rec.count >= self._max_attempts:
            rec.locked_until = now + self._lockout

    def record_success(self, email: str) -> None:
        """Clear failure record on successful login."""
        key = email.strip().lower()
        self._records.pop(key, None)

    def cleanup_expired(self) -> None:
        """Remove stale entries. Called periodically by the scheduler."""
        now = time.monotonic()
        stale = [
            k
            for k, v in self._records.items()
            if now - v.first_failure > self._window and v.locked_until <= now
        ]
        for k in stale:
            del self._records[k]


login_guard = LoginGuard()
