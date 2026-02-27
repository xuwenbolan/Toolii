from __future__ import annotations

import time
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.token_blacklist import TokenBlacklistEntry


class TokenBlacklistService:
    """DB-backed token blacklist with in-memory cache for fast lookups."""

    def __init__(self) -> None:
        self._cache: dict[str, int] = {}  # jti -> exp (unix timestamp)

    async def revoke(
        self,
        db: AsyncSession,
        *,
        jti: str,
        user_id: int,
        token_type: str,
        expires_at: datetime,
    ) -> None:
        """Revoke a token by adding it to the blacklist."""
        entry = TokenBlacklistEntry(
            jti=jti,
            user_id=user_id,
            token_type=token_type,
            expires_at=expires_at,
        )
        db.add(entry)
        await db.commit()
        self._cache[jti] = int(expires_at.timestamp())

    def is_revoked(self, jti: str) -> bool:
        """Check if a JTI is in the in-memory cache (fast path)."""
        return jti in self._cache

    async def is_revoked_async(self, db: AsyncSession, jti: str) -> bool:
        """Check DB if not in cache (slow path)."""
        if jti in self._cache:
            return True
        result = await db.execute(
            select(TokenBlacklistEntry.id)
            .where(TokenBlacklistEntry.jti == jti)
            .limit(1)
        )
        if result.scalar_one_or_none() is not None:
            self._cache[jti] = 0
            return True
        return False

    async def cleanup_expired(self, db: AsyncSession) -> None:
        """Remove expired entries from DB and cache."""
        now = datetime.now(timezone.utc)
        await db.execute(
            delete(TokenBlacklistEntry).where(TokenBlacklistEntry.expires_at < now)
        )
        await db.commit()
        now_ts = int(time.time())
        self._cache = {
            jti: exp for jti, exp in self._cache.items() if exp > now_ts or exp == 0
        }

    async def load_cache(self, db: AsyncSession) -> None:
        """Load active blacklist entries into cache on startup."""
        now = datetime.now(timezone.utc)
        result = await db.execute(
            select(TokenBlacklistEntry.jti, TokenBlacklistEntry.expires_at).where(
                TokenBlacklistEntry.expires_at >= now
            )
        )
        for row in result:
            self._cache[row.jti] = int(row.expires_at.timestamp())


token_blacklist = TokenBlacklistService()
