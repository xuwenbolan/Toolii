"""Centralized logging configuration.

Call ``setup_logging()`` once at application startup to configure the root
logger with either human-readable (development) or JSON (production) output.
"""

from __future__ import annotations

import logging
import sys
from datetime import datetime, timezone
from typing import Any

import orjson


class _JSONFormatter(logging.Formatter):
    """Compact JSON log formatter using orjson."""

    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info and record.exc_info[0] is not None:
            entry["exc"] = self.formatException(record.exc_info)
        if record.stack_info:
            entry["stack"] = record.stack_info
        return orjson.dumps(entry).decode()


_DEV_FORMAT = "%(asctime)s %(levelname)-8s [%(name)s] %(message)s"
_DEV_DATEFMT = "%Y-%m-%d %H:%M:%S"

# Libraries that produce excessive output at INFO level.
_NOISY_LOGGERS = ("httpx", "httpcore", "uvicorn.access", "apscheduler", "PIL", "aiosqlite")


def setup_logging(*, level: str = "INFO", json_output: bool = False) -> None:
    """Initialize application logging.

    Args:
        level: Root log level (DEBUG, INFO, WARNING, ERROR).
        json_output: Use JSON format for production environments.
    """
    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Remove existing handlers to avoid duplicates on reload.
    for handler in root.handlers[:]:
        root.removeHandler(handler)

    handler = logging.StreamHandler(sys.stderr)
    if json_output:
        handler.setFormatter(_JSONFormatter())
    else:
        handler.setFormatter(logging.Formatter(fmt=_DEV_FORMAT, datefmt=_DEV_DATEFMT))
    root.addHandler(handler)

    for name in _NOISY_LOGGERS:
        logging.getLogger(name).setLevel(logging.WARNING)
