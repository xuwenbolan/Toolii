from __future__ import annotations

from collections.abc import AsyncGenerator

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db as _get_db
from app.core.exceptions import AppError, ForbiddenError, UnauthorizedError
from app.core.security import decode_jwt_token
from app.core.token_blacklist import token_blacklist
from app.models.user import User


# ---------------------------------------------------------------------------
# Tool recording helpers (injected by ToolGatewayRoute)
# ---------------------------------------------------------------------------

def tool_credit_cost(request: Request) -> int:
    """Read tool credit_cost injected by ToolGatewayRoute."""
    return getattr(request.state, "tool_credit_cost", 0)


def tool_owner_user_id(request: Request) -> int | None:
    """Read owner user_id injected by ToolGatewayRoute."""
    return getattr(request.state, "tool_user_id", None)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async for session in _get_db():
        yield session


_bearer = HTTPBearer(auto_error=False)


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    if credentials is None:
        return None
    token = decode_jwt_token(credentials.credentials)
    if token.token_type != "access":
        raise UnauthorizedError("Invalid token type")

    jti = token.raw.get("jti")
    if jti and await token_blacklist.is_revoked_async(db, jti):
        raise UnauthorizedError("Token has been revoked")

    try:
        user_id = int(token.sub)
    except ValueError as exc:
        raise UnauthorizedError("Invalid token subject") from exc

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        return None

    # Check if all tokens were revoked (logout-all)
    if user.tokens_revoked_at is not None:
        iat = token.iat
        if iat < int(user.tokens_revoked_at.timestamp()):
            raise UnauthorizedError("Token has been revoked")

    return user


async def get_current_user(
    user: User | None = Depends(get_optional_user),
) -> User:
    if user is None:
        raise UnauthorizedError()
    return user


async def get_verified_user(
    user: User = Depends(get_current_user),
) -> User:
    """Require a logged-in user whose email address has been verified."""
    if not user.email_verified:
        raise AppError(
            code="EMAIL_NOT_VERIFIED",
            message="Email verification required",
            status_code=403,
        )
    return user


async def get_admin_user(
    user: User = Depends(get_current_user),
) -> User:
    if not user.is_admin:
        raise ForbiddenError("Admin access required")
    return user
