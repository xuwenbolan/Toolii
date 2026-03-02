from __future__ import annotations

import asyncio
import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import AppError, UnauthorizedError
from app.core.login_guard import login_guard
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_jwt_token,
    hash_password,
    verify_password,
)
from app.models.email_verification import EmailVerificationToken
from app.models.password_reset import PasswordResetToken
from app.models.user import User
from app.models.user_credit import UserCredit
from app.services.email.factory import get_email_service

logger = logging.getLogger("app.services.auth")


_background_tasks: set[asyncio.Task] = set()  # prevent GC of fire-and-forget tasks


def _fire_and_forget_email(coro):  # noqa: ANN001
    """Schedule an email coroutine as a background task with error logging."""
    async def _wrapper():
        try:
            await coro
        except Exception:
            logger.exception("Background email sending failed")
    task = asyncio.create_task(_wrapper())
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


class AuthService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def register(
        self, *, email: str, password: str, name: str | None = None, lang: str = "zh"
    ) -> tuple[User, str | None]:
        """Register a new user. Returns (user, dev_token) where dev_token is
        the raw verification token only in dev mode (for testing convenience)."""
        email = email.strip().lower()

        result = await self._db.execute(select(User).where(User.email == email))
        if result.scalar_one_or_none() is not None:
            raise AppError(code="EMAIL_EXISTS", message="Email already registered", status_code=409)

        user = User(email=email, hashed_password=hash_password(password), name=name)
        self._db.add(user)
        await self._db.flush()

        self._db.add(UserCredit(user_id=user.id, balance=0))

        # Create email verification token
        raw_token = await self._create_verification_token(user.id)

        await self._db.commit()
        await self._db.refresh(user)

        # Send verification email (fire-and-forget, don't block registration)
        email_svc = get_email_service()
        _fire_and_forget_email(
            email_svc.send_verification_email(
                to_email=user.email,
                token=raw_token,
                base_url=settings.frontend_base_url,
                lang=lang,
            )
        )

        dev_token = raw_token if settings.env == "dev" else None
        return user, dev_token

    async def login(self, *, email: str, password: str) -> User:
        email = email.strip().lower()

        # Check lockout before doing any DB work
        login_guard.check(email)

        result = await self._db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user is None:
            login_guard.record_failure(email)
            raise UnauthorizedError("Invalid email or password")
        if not user.is_active and user.deleted_at is not None:
            raise AppError(
                code="ACCOUNT_DELETED",
                message="Account deleted, recoverable within 7 days",
                status_code=403,
            )
        if not user.is_active:
            login_guard.record_failure(email)
            raise UnauthorizedError("Invalid email or password")
        if not user.hashed_password:
            login_guard.record_failure(email)
            raise UnauthorizedError("This account only supports Google login")
        if not verify_password(password, user.hashed_password):
            login_guard.record_failure(email)
            raise UnauthorizedError("Invalid email or password")

        login_guard.record_success(email)
        return user

    async def google_auth(self, *, access_token: str, link_password: str | None = None) -> User:
        if not settings.google_oauth_client_id:
            raise AppError(code="GOOGLE_OAUTH_DISABLED", message="Google login not configured", status_code=400)

        import httpx

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    "https://www.googleapis.com/oauth2/v3/userinfo",
                    headers={"Authorization": f"Bearer {access_token}"},
                    timeout=10,
                )
                resp.raise_for_status()
                payload = resp.json()
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            raise UnauthorizedError("Invalid Google credentials") from exc

        sub = payload.get("sub")
        email = payload.get("email")
        email_verified = payload.get("email_verified")
        if not isinstance(sub, str) or not isinstance(email, str):
            raise UnauthorizedError("Invalid Google credentials")
        if email_verified is False:
            raise UnauthorizedError("Google email not verified")

        email = email.strip().lower()

        # Look up by Google sub first
        result = await self._db.execute(select(User).where(User.google_sub == sub))
        user = result.scalar_one_or_none()

        # If not found by sub, try email match
        matched_by_email = False
        if user is None:
            result = await self._db.execute(select(User).where(User.email == email))
            user = result.scalar_one_or_none()
            if user is not None:
                matched_by_email = True

        name = payload.get("name")

        if user is None:
            # New user — create account
            user = User(
                email=email, google_sub=sub, hashed_password=None,
                name=name, email_verified=True,
            )
            self._db.add(user)
            await self._db.flush()
            self._db.add(UserCredit(user_id=user.id, balance=0))
        elif matched_by_email and not user.google_sub and user.hashed_password:
            # Existing account with password — require password confirmation to link
            if not link_password:
                raise AppError(
                    code="LINK_REQUIRES_PASSWORD",
                    message="An account with this email already exists, please enter password to link Google login",
                    status_code=409,
                )
            if not verify_password(link_password, user.hashed_password):
                raise AppError(
                    code="WRONG_PASSWORD",
                    message="Wrong password",
                    status_code=401,
                )
            user.google_sub = sub
            if name and not user.name:
                user.name = name
            user.email_verified = True
        else:
            # Existing Google-linked user or account without password
            if not user.google_sub:
                user.google_sub = sub
            if name and not user.name:
                user.name = name
            user.email = email
            user.email_verified = True
            user.is_active = True

        try:
            await self._db.commit()
        except IntegrityError as exc:
            await self._db.rollback()
            raise AppError(code="GOOGLE_AUTH_CONFLICT", message="Google login conflict", status_code=409) from exc

        await self._db.refresh(user)
        return user

    async def refresh(self, *, refresh_token: str) -> User:
        from app.core.token_blacklist import token_blacklist

        token = decode_jwt_token(refresh_token)
        if token.token_type != "refresh":
            raise UnauthorizedError("Invalid token type")

        jti = token.raw.get("jti")
        if jti and token_blacklist.is_revoked(jti):
            raise UnauthorizedError("Token has been revoked")
        if jti and await token_blacklist.is_revoked_async(self._db, jti):
            raise UnauthorizedError("Token has been revoked")

        try:
            user_id = int(token.sub)
        except ValueError as exc:
            raise UnauthorizedError("Invalid token subject") from exc

        result = await self._db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None or not user.is_active:
            raise UnauthorizedError("User not found")

        if user.tokens_revoked_at is not None:
            if token.iat < int(user.tokens_revoked_at.timestamp()):
                raise UnauthorizedError("Token has been revoked")

        return user

    async def verify_email(self, *, token: str) -> User:
        """Verify email using raw token string. Returns the user on success.
        Idempotent: if the token was already used but the user is verified, return success."""
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        now = datetime.now(timezone.utc)

        # First try: unused, non-expired token
        result = await self._db.execute(
            select(EmailVerificationToken).where(
                EmailVerificationToken.token_hash == token_hash,
                EmailVerificationToken.used_at.is_(None),
                EmailVerificationToken.expires_at > now,
            )
        )
        record = result.scalar_one_or_none()

        if record is not None:
            record.used_at = now
            result = await self._db.execute(select(User).where(User.id == record.user_id))
            user = result.scalar_one_or_none()
            if user is None:
                raise AppError(code="USER_NOT_FOUND", message="User not found", status_code=404)
            user.email_verified = True
            await self._db.commit()
            await self._db.refresh(user)
            return user

        # Idempotent retry: token exists and was already used
        result = await self._db.execute(
            select(EmailVerificationToken).where(
                EmailVerificationToken.token_hash == token_hash,
                EmailVerificationToken.used_at.is_not(None),
            )
        )
        used_record = result.scalar_one_or_none()
        if used_record is not None:
            result = await self._db.execute(select(User).where(User.id == used_record.user_id))
            user = result.scalar_one_or_none()
            if user is not None and user.email_verified:
                return user

        raise AppError(
            code="INVALID_VERIFICATION_TOKEN",
            message="Verification link invalid or expired",
            status_code=400,
        )

    async def resend_verification(self, *, user_id: int, lang: str = "zh") -> str | None:
        """Resend verification email. Returns raw token in dev mode."""
        result = await self._db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None:
            raise AppError(code="USER_NOT_FOUND", message="User not found", status_code=404)
        if user.email_verified:
            raise AppError(code="ALREADY_VERIFIED", message="Email already verified", status_code=400)

        raw_token = await self._create_verification_token(user.id)
        await self._db.commit()

        email_svc = get_email_service()
        _fire_and_forget_email(
            email_svc.send_verification_email(
                to_email=user.email,
                token=raw_token,
                base_url=settings.frontend_base_url,
                lang=lang,
            )
        )

        return raw_token if settings.env == "dev" else None

    async def _create_verification_token(self, user_id: int) -> str:
        """Create a verification token and store its hash in DB. Returns raw token."""
        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        expires_at = datetime.now(timezone.utc) + timedelta(
            hours=settings.email_verification_expire_hours
        )
        record = EmailVerificationToken(
            user_id=user_id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        self._db.add(record)
        return raw_token

    async def forgot_password(self, *, email: str, lang: str = "zh") -> str | None:
        """Create password reset token and send email.
        Always returns successfully to avoid email enumeration.
        Returns raw token in dev mode if user exists."""
        email = email.strip().lower()
        result = await self._db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        if user is None or not user.is_active or not user.hashed_password:
            # Don't reveal whether email exists
            return None

        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        expires_at = datetime.now(timezone.utc) + timedelta(
            minutes=settings.password_reset_expire_minutes
        )
        record = PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        self._db.add(record)
        await self._db.commit()

        email_svc = get_email_service()
        _fire_and_forget_email(
            email_svc.send_password_reset_email(
                to_email=user.email,
                token=raw_token,
                base_url=settings.frontend_base_url,
                lang=lang,
            )
        )

        return raw_token if settings.env == "dev" else None

    async def reset_password(self, *, token: str, new_password: str) -> User:
        """Verify reset token and update password. Revokes all existing sessions."""
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        now = datetime.now(timezone.utc)

        result = await self._db.execute(
            select(PasswordResetToken).where(
                PasswordResetToken.token_hash == token_hash,
                PasswordResetToken.used_at.is_(None),
                PasswordResetToken.expires_at > now,
            )
        )
        record = result.scalar_one_or_none()
        if record is None:
            raise AppError(
                code="INVALID_RESET_TOKEN",
                message="Reset link invalid or expired",
                status_code=400,
            )

        record.used_at = now

        result = await self._db.execute(select(User).where(User.id == record.user_id))
        user = result.scalar_one_or_none()
        if user is None or not user.is_active:
            raise AppError(code="USER_NOT_FOUND", message="User not found", status_code=404)

        user.hashed_password = hash_password(new_password)
        # Revoke all existing sessions for security
        user.tokens_revoked_at = now
        await self._db.commit()
        await self._db.refresh(user)
        return user

    @staticmethod
    def issue_tokens(*, user_id: int) -> dict:
        """Issue access + refresh tokens. Returns dict with token strings and JTIs."""
        access_token, expires_in = create_access_token(user_id=user_id)
        refresh_token, _refresh_expires_in = create_refresh_token(user_id=user_id)
        access_decoded = decode_jwt_token(access_token)
        refresh_decoded = decode_jwt_token(refresh_token)
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_in": expires_in,
            "access_jti": access_decoded.raw.get("jti"),
            "refresh_jti": refresh_decoded.raw.get("jti"),
        }
