from __future__ import annotations

import json
import logging
from typing import Any


class _JsonFormatter(logging.Formatter):
    """Format log records as single-line JSON."""

    def format(self, record: logging.LogRecord) -> str:
        data: dict[str, Any] = {
            "ts": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "event": record.getMessage(),
        }
        extra: dict[str, Any] | None = getattr(record, "extra_data", None)
        if extra:
            data.update(extra)
        return json.dumps(data, ensure_ascii=False)


def _setup() -> logging.Logger:
    logger = logging.getLogger("app.audit")
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(_JsonFormatter())
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        logger.propagate = False
    return logger


_logger = _setup()


def log_auth_event(
    event: str,
    *,
    email: str | None = None,
    user_id: int | None = None,
    ip: str | None = None,
    success: bool = True,
    detail: str | None = None,
) -> None:
    """Write a structured auth audit log entry."""
    extra: dict[str, Any] = {
        "category": "auth",
        "email": email,
        "user_id": user_id,
        "ip": ip,
        "success": success,
    }
    if detail:
        extra["detail"] = detail

    record_extra = {"extra_data": extra}
    if success:
        _logger.info(event, extra=record_extra)
    else:
        _logger.warning(event, extra=record_extra)
