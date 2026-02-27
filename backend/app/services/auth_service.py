from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import AppError, UnauthorizedError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_jwt_token,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.models.user_credit import UserCredit

class AuthService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def register(self, *, email: str, password: str) -> User:
        email = email.strip().lower()

        result = await self._db.execute(select(User).where(User.email == email))
        if result.scalar_one_or_none() is not None:
            raise AppError(code="EMAIL_EXISTS", message="邮箱已注册", status_code=409)

        user = User(email=email, hashed_password=hash_password(password))
        self._db.add(user)
        await self._db.flush()

        self._db.add(UserCredit(user_id=user.id, balance=0))
        await self._db.commit()
        await self._db.refresh(user)
        return user

    async def login(self, *, email: str, password: str) -> User:
        email = email.strip().lower()
        result = await self._db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user is None or not user.is_active:
            raise UnauthorizedError("邮箱或密码错误")
        if not user.hashed_password:
            raise UnauthorizedError("该账号仅支持 Google 登录")
        if not verify_password(password, user.hashed_password):
            raise UnauthorizedError("邮箱或密码错误")
        return user

    async def google_auth(self, *, credential: str) -> User:
        if not settings.google_oauth_client_id:
            raise AppError(code="GOOGLE_OAUTH_DISABLED", message="Google 登录未配置", status_code=400)

        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token as google_id_token

        try:
            payload = google_id_token.verify_oauth2_token(
                credential,
                google_requests.Request(),
                settings.google_oauth_client_id,
            )
        except Exception as exc:  # noqa: BLE001
            raise UnauthorizedError("Google 凭证无效") from exc

        sub = payload.get("sub")
        email = payload.get("email")
        email_verified = payload.get("email_verified")
        if not isinstance(sub, str) or not isinstance(email, str):
            raise UnauthorizedError("Google 凭证无效")
        if email_verified is False:
            raise UnauthorizedError("Google 邮箱未验证")

        email = email.strip().lower()

        result = await self._db.execute(select(User).where(User.google_sub == sub))
        user = result.scalar_one_or_none()
        if user is None:
            result = await self._db.execute(select(User).where(User.email == email))
            user = result.scalar_one_or_none()

        if user is None:
            user = User(email=email, google_sub=sub, hashed_password=None)
            self._db.add(user)
            await self._db.flush()
            self._db.add(UserCredit(user_id=user.id, balance=0))
        else:
            if not user.google_sub:
                user.google_sub = sub
            user.email = email
            user.is_active = True

        try:
            await self._db.commit()
        except IntegrityError as exc:
            await self._db.rollback()
            raise AppError(code="GOOGLE_AUTH_CONFLICT", message="Google 登录冲突", status_code=409) from exc

        await self._db.refresh(user)
        return user

    async def refresh(self, *, refresh_token: str) -> User:
        token = decode_jwt_token(refresh_token)
        if token.token_type != "refresh":
            raise UnauthorizedError("Invalid token type")

        try:
            user_id = int(token.sub)
        except ValueError as exc:
            raise UnauthorizedError("Invalid token subject") from exc

        result = await self._db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None or not user.is_active:
            raise UnauthorizedError("User not found")
        return user

    @staticmethod
    def issue_tokens(*, user_id: int) -> tuple[str, str, int]:
        access_token, expires_in = create_access_token(user_id=user_id)
        refresh_token, _refresh_expires_in = create_refresh_token(user_id=user_id)
        return access_token, refresh_token, expires_in
