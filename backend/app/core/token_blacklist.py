from __future__ import annotations

import time


class TokenBlacklist:
    """In-memory store of revoked JWT IDs (jti).

    Entries are automatically cleaned up once the original token would have
    expired naturally, so the dict never grows unbounded.
    """

    def __init__(self) -> None:
        self._entries: dict[str, int] = {}  # jti -> exp (unix timestamp)

    def revoke(self, jti: str, exp: int) -> None:
        """Mark *jti* as revoked until *exp*."""
        self._entries[jti] = exp

    def is_revoked(self, jti: str) -> bool:
        return jti in self._entries

    def cleanup_expired(self) -> None:
        """Remove entries whose tokens have expired naturally."""
        now = int(time.time())
        self._entries = {jti: exp for jti, exp in self._entries.items() if exp > now}


token_blacklist = TokenBlacklist()
