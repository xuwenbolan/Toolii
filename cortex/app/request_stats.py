"""Per-endpoint request counting, timing, and statistics."""
from __future__ import annotations

import dataclasses
import logging
import time
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class EndpointStats:
    calls: int = 0
    errors: int = 0
    total_ms: int = 0
    min_ms: int = 999999
    max_ms: int = 0
    last_call: float = 0.0


class RequestStatsTracker:
    """Tracks per-endpoint call counts, latencies, and error rates."""

    def __init__(self) -> None:
        self._stats: dict[str, EndpointStats] = {}

    def record(self, endpoint: str, elapsed_ms: int, error: bool = False) -> None:
        """Record a completed request for the given endpoint."""
        s = self._stats.setdefault(endpoint, EndpointStats())
        s.calls += 1
        s.last_call = time.time()
        s.total_ms += elapsed_ms
        if elapsed_ms < s.min_ms:
            s.min_ms = elapsed_ms
        if elapsed_ms > s.max_ms:
            s.max_ms = elapsed_ms
        if error:
            s.errors += 1

    def get_stats(self) -> dict[str, Any]:
        """Return per-endpoint inference statistics."""
        result: dict[str, Any] = {}
        for ep, s in self._stats.items():
            avg_ms = s.total_ms // s.calls if s.calls > 0 else 0
            result[ep] = {
                "calls": s.calls,
                "errors": s.errors,
                "avg_ms": avg_ms,
                "min_ms": s.min_ms if s.calls > 0 else 0,
                "max_ms": s.max_ms,
                "last_call": s.last_call,
            }
        return result

    def dump(self) -> dict[str, Any]:
        """Serialize endpoint stats for persistence."""
        return {ep: dataclasses.asdict(s) for ep, s in self._stats.items()}

    def load(self, data: dict[str, Any]) -> None:
        """Restore endpoint stats from saved data."""
        for ep, values in data.items():
            try:
                self._stats[ep] = EndpointStats(**values)
            except (TypeError, ValueError):
                logger.warning("Skipping invalid stats for endpoint %s", ep)
