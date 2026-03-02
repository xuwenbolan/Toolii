"""Automatic tool usage recording via custom APIRoute."""

from __future__ import annotations

import logging

from fastapi.routing import APIRoute
from jose import JWTError, jwt
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings
from app.core.database import SessionLocal
from app.models.processing_history import ProcessingHistory

logger = logging.getLogger(__name__)


def _try_extract_user_id(request: Request) -> int | None:
    """Best-effort extraction of user_id from JWT token."""
    auth = request.headers.get("authorization")
    if not auth or not auth.lower().startswith("bearer "):
        return None
    try:
        payload = jwt.decode(
            auth[7:],
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
            options={"verify_aud": False},
        )
        if payload.get("type") != "access":
            return None
        return int(payload["sub"])
    except (JWTError, KeyError, ValueError, TypeError):
        return None


async def _record_usage(tool_name: str, user_id: int | None) -> None:
    """Record a single tool usage entry in its own db session."""
    try:
        async with SessionLocal() as session:
            session.add(ProcessingHistory(
                user_id=user_id,
                tool_name=tool_name,
                status="done",
            ))
            await session.commit()
    except Exception:
        logger.warning("Failed to record tool usage for %s", tool_name, exc_info=True)


class ToolRecordingRoute(APIRoute):
    """APIRoute subclass that auto-records successful tool usage."""

    def get_route_handler(self):
        original = super().get_route_handler()

        async def handler(request: Request) -> Response:
            response = await original(request)
            if response.status_code < 400:
                # Derive tool_name from path: /api/v1/image/compress -> image/compress
                parts = request.url.path.rstrip("/").split("/")
                tool_name = f"{parts[-2]}/{parts[-1]}" if len(parts) >= 2 else request.url.path
                user_id = _try_extract_user_id(request)
                await _record_usage(tool_name, user_id)
            return response

        return handler
