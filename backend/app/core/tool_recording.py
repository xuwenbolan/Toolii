"""Tool gateway: availability checks, access control, credit pre-check, and usage recording."""

from __future__ import annotations

import json
import logging

from fastapi.routing import APIRoute
import jwt
from jwt.exceptions import PyJWTError
from sqlalchemy.exc import SQLAlchemyError
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings
from app.core.exceptions import AppError
from app.models.processing_history import ProcessingHistory

logger = logging.getLogger(__name__)


def _default_session_factory():
    from app.core import database
    return database.SessionLocal()


# Overridable session factory for testing
session_factory = _default_session_factory


# Categories where all endpoints share a single tool identity
_CATEGORY_TOOL_OVERRIDES = {
    "pdf": "pdf/tools",
    "docx": "docx/tools",
    "photo": "photo/idphoto",
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
    """Best-effort extraction of user_id from JWT token.

    Checks the in-memory token blacklist (O(1)) to reject revoked tokens.
    """
    from app.core.token_blacklist import token_blacklist

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
        jti = payload.get("jti")
        if jti and token_blacklist.is_revoked(jti):
            return None
        return int(payload["sub"])
    except (PyJWTError, KeyError, ValueError, TypeError):
        return None


async def _check_is_admin(user_id: int) -> bool:
    """Check if user is admin via DB lookup."""
    from app.models.user import User

    try:
        async with session_factory() as db:
            from sqlalchemy import select
            result = await db.execute(
                select(User.is_admin).where(User.id == user_id),
            )
            row = result.scalar_one_or_none()
            return bool(row)
    except SQLAlchemyError:
        return False


def _extract_ip(request: Request) -> str | None:
    """Extract client IP from X-Forwarded-For or direct connection."""
    xff = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    return xff or (request.client.host if request.client else None)


async def _record_usage(
    tool_name: str,
    user_id: int | None,
    request: Request,
) -> None:
    """Record a single tool usage entry in its own db session."""
    try:
        ip = _extract_ip(request)
        ua = (request.headers.get("user-agent") or "")[:256] or None
        async with session_factory() as session:
            session.add(ProcessingHistory(
                user_id=user_id,
                tool_name=tool_name,
                status="done",
                ip=ip,
                user_agent=ua,
            ))
            await session.commit()
    except SQLAlchemyError:
        logger.warning("Failed to record tool usage for %s", tool_name, exc_info=True)


async def _check_balance(user_id: int, amount: int) -> None:
    """Verify user has sufficient credits. Raises AppError(402) if not."""
    from app.services.credit_service import CreditService

    async with session_factory() as db:
        svc = CreditService(db)
        balance = await svc.get_balance(user_id)
        if balance < amount:
            raise AppError(
                code="INSUFFICIENT_CREDITS",
                message="Insufficient credits",
                status_code=402,
            )


async def _register_tool_result(response: Response, user_id: int | None) -> None:
    """Register tool result files in the hub (user_files table).

    Parses the JSON response body; if it contains a file_id field, creates
    a UserFile record so the file appears in the user's hub file list.
    Anonymous users are skipped — they cannot access the hub, so registering
    files (and generating thumbnails) would only create garbage data.
    """
    if user_id is None:
        return
    if not hasattr(response, "body"):
        return
    try:
        body = json.loads(response.body)
    except (json.JSONDecodeError, ValueError, AttributeError):
        return

    file_id = body.get("file_id")
    if not file_id or not isinstance(file_id, str):
        return

    try:
        from app.services.hub_service import HubService

        async with session_factory() as db:
            hub = HubService(db)
            meta_dict = body.get("meta")
            # Exclude meta from the API response (internal field)
            if "meta" in body:
                del body["meta"]
                response.body = json.dumps(body).encode("utf-8")
                response.headers["content-length"] = str(len(response.body))

            await hub.save_tool_result(
                user_id=user_id,
                file_id=file_id,
                filename=body.get("filename", "download"),
                content_type=body.get("content_type", "application/octet-stream"),
                size=int(body.get("size", 0)),
                meta=meta_dict,
            )
            await db.commit()
    except (SQLAlchemyError, OSError):
        logger.warning("Failed to register tool result in hub", exc_info=True)


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

            # 3. Daily limit check (per-IP for anonymous users)
            daily_limit = tool.daily_limit_auth if user_id else tool.daily_limit_anon
            if daily_limit is not None:
                client_ip = _extract_ip(request) if user_id is None else None
                count = await tool_service.get_daily_usage_count(
                    tool_name, user_id, ip=client_ip,
                )
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

            # Store credit/user info on request.state for downstream service use
            request.state.tool_credit_cost = tool.credit_cost
            request.state.tool_user_id = user_id

            # 5. Execute the actual handler
            response = await original(request)

            # 6. Record usage and register tool result in hub on success
            if response.status_code < 400:
                await _record_usage(tool_name, user_id, request)
                await _register_tool_result(response, user_id)

            return response

        return handler

