from __future__ import annotations

from collections.abc import AsyncGenerator

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db as _get_db
from app.core.exceptions import UnauthorizedError
from app.core.security import decode_jwt_token
from app.core.token_blacklist import token_blacklist
from app.models.user import User


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
    if jti and token_blacklist.is_revoked(jti):
        raise UnauthorizedError("Token has been revoked")

    try:
        user_id = int(token.sub)
    except ValueError as exc:
        raise UnauthorizedError("Invalid token subject") from exc

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        return None
    return user


async def get_current_user(
    user: User | None = Depends(get_optional_user),
) -> User:
    if user is None:
        raise UnauthorizedError()
    return user
