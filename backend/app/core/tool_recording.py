"""Tool gateway: availability checks, access control, credit pre-check, and usage recording."""

from __future__ import annotations

import logging

from fastapi.routing import APIRoute
from jose import JWTError, jwt
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings
from app.core import database as _db
from app.core.exceptions import AppError
from app.models.processing_history import ProcessingHistory

logger = logging.getLogger(__name__)


# Categories where all endpoints share a single tool identity
_CATEGORY_TOOL_OVERRIDES = {
    "pdf": "pdf/tools",
}


def _extract_tool_name(path: str) -> str:
    """Derive tool_name from URL path: /api/v1/image/compress -> image/compress"""
    parts = path.rstrip("/").split("/")
    if len(parts) >= 2:
        category = parts[-2]
        if category in _CATEGORY_TOOL_OVERRIDES:
            return _CATEGORY_TOOL_OVERRIDES[category]
        return f"{category}/{parts[-1]}"
    return path


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


async def _check_is_admin(user_id: int) -> bool:
    """Check if user is admin via DB lookup."""
    from app.models.user import User

    try:
        async with _db.SessionLocal() as db:
            from sqlalchemy import select
            result = await db.execute(
                select(User.is_admin).where(User.id == user_id),
            )
            row = result.scalar_one_or_none()
            return bool(row)
    except Exception:
        return False


async def _record_usage(tool_name: str, user_id: int | None) -> None:
    """Record a single tool usage entry in its own db session."""
    try:
        async with _db.SessionLocal() as session:
            session.add(ProcessingHistory(
                user_id=user_id,
                tool_name=tool_name,
                status="done",
            ))
            await session.commit()
    except Exception:
        logger.warning("Failed to record tool usage for %s", tool_name, exc_info=True)


async def _check_balance(user_id: int, amount: int) -> None:
    """Verify user has sufficient credits. Raises AppError(402) if not."""
    from app.services.credit_service import CreditService

    async with _db.SessionLocal() as db:
        svc = CreditService(db)
        balance = await svc.get_balance(user_id)
        if balance < amount:
            raise AppError(
                code="INSUFFICIENT_CREDITS",
                message="Insufficient credits",
                status_code=402,
            )


class ToolGatewayRoute(APIRoute):
    """APIRoute subclass that enforces tool availability, access control,
    credit pre-checks, and records successful tool usage.

    When credit_cost > 0, credits are NOT charged here.  Instead the
    tool's credit_cost is stored on ``request.state`` so that the
    service layer can generate a gated (watermarked) result.  Actual
    charging happens at the unlock/download endpoint.
    """

    def get_route_handler(self):
        original = super().get_route_handler()

        async def handler(request: Request) -> Response:
            # Import here to avoid circular imports at module load time
            from app.services import tool_service

            tool_name = _extract_tool_name(request.url.path)
            tool = await tool_service.get_tool(tool_name)

            # Fail-open: if tool is not registered in DB, pass through
            # (covers /share and other non-tool endpoints on the same router)
            if tool is None:
                return await original(request)

            # 1. Enabled check
            if not tool.is_enabled:
                raise AppError(
                    code="TOOL_DISABLED",
                    message=f"Tool '{tool_name}' is currently disabled",
                    status_code=403,
                )

            user_id = _try_extract_user_id(request)

            # 2. Access level check
            if tool.access_level != "public":
                if user_id is None:
                    raise AppError(
                        code="UNAUTHORIZED",
                        message="Authentication required",
                        status_code=401,
                    )
                if tool.access_level == "admin" and not await _check_is_admin(user_id):
                    raise AppError(
                        code="TOOL_ACCESS_DENIED",
                        message="Admin access required",
                        status_code=403,
                    )
                # "verified" delegates to endpoint's Depends(get_verified_user)
                # "auth" is satisfied by having a valid user_id

            # 3. Daily limit check
            daily_limit = tool.daily_limit_auth if user_id else tool.daily_limit_anon
            if daily_limit is not None:
                count = await tool_service.get_daily_usage_count(tool_name, user_id)
                if count >= daily_limit:
                    raise AppError(
                        code="TOOL_DAILY_LIMIT",
                        message=f"Daily usage limit ({daily_limit}) exceeded for '{tool_name}'",
                        status_code=429,
                    )

            # 4. Credit pre-check (balance verification only, no charge)
            if tool.credit_cost > 0:
                if user_id is None:
                    raise AppError(
                        code="UNAUTHORIZED",
                        message="Authentication required for paid tools",
                        status_code=401,
                    )
                await _check_balance(user_id, tool.credit_cost)

            # Store credit info on request.state for downstream service use
            request.state.tool_credit_cost = tool.credit_cost

            # 5. Execute the actual handler
            response = await original(request)

            # 6. Record usage on success
            if response.status_code < 400:
                await _record_usage(tool_name, user_id)

            return response

        return handler


# Backward-compatible alias so existing imports continue to work
ToolRecordingRoute = ToolGatewayRoute
