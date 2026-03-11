"""Unified audit logging: writes to both database and structured JSON log.

Usage:
    from app.core.audit_log import audit

    await audit(
        category="auth",
        action="login",
        user_id=user.id,
        ip=ip,
        detail={"email": user.email},
    )
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any


_logger = logging.getLogger("app.audit")


def _default_session_factory():
    from app.core import database
    return database.SessionLocal()


# Overridable session factory for testing
session_factory = _default_session_factory


async def audit(
    *,
    category: str,
    action: str,
    user_id: int | None = None,
    success: bool = True,
    resource_type: str | None = None,
    resource_id: str | int | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
    detail: str | dict[str, Any] | None = None,
) -> None:
    """Record an audit event to DB and structured log.

    Fire-and-forget: uses its own DB session and never raises to the caller.
    """
    detail_str: str | None = None
    if detail is not None:
        detail_str = detail if isinstance(detail, str) else json.dumps(detail, ensure_ascii=False)

    resource_id_str = str(resource_id) if resource_id is not None else None

    # 1. Structured log output (always, even if DB write fails)
    log_data: dict[str, Any] = {
        "category": category,
        "action": action,
        "user_id": user_id,
        "success": success,
    }
    if resource_type:
        log_data["resource_type"] = resource_type
    if resource_id_str:
        log_data["resource_id"] = resource_id_str
    if ip:
        log_data["ip"] = ip
    if detail_str:
        log_data["detail"] = detail_str

    log_fn = _logger.info if success else _logger.warning
    log_fn("%s.%s", category, action, extra={"audit": log_data})

    # 2. Persist to database
    try:
        from app.models.audit_log import AuditLog

        async with session_factory() as session:
            session.add(AuditLog(
                user_id=user_id,
                category=category,
                action=action,
                success=success,
                resource_type=resource_type,
                resource_id=resource_id_str,
                ip=ip,
                user_agent=user_agent,
                detail=detail_str,
            ))
            await session.commit()
    except Exception:  # noqa: BLE001 — fire-and-forget must never propagate
        _logger.warning(
            "Failed to persist audit log: %s.%s", category, action, exc_info=True,
        )


def log_auth_event(
    event: str,
    *,
    email: str | None = None,
    user_id: int | None = None,
    ip: str | None = None,
    success: bool = True,
    detail: str | None = None,
) -> None:
    """Backward-compatible sync wrapper for existing auth call sites.

    Schedules audit() as a background task on the running event loop.
    """
    d: dict[str, Any] = {}
    if email:
        d["email"] = email
    if detail:
        d["detail"] = detail

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(audit(
            category="auth",
            action=event,
            user_id=user_id,
            ip=ip,
            success=success,
            detail=d or None,
        ))
    except RuntimeError:
        _logger.info(
            "auth.%s (no-loop)", event,
            extra={"audit": {"category": "auth", "action": event, "user_id": user_id, "ip": ip}},
        )
