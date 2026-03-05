from __future__ import annotations

import base64
import bcrypt
import hashlib
import hmac
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from jose import JWTError, jwt

from app.core.config import settings
from app.core.exceptions import UnauthorizedError
from app.utils.time_utils import utcnow


def _prehash(password: str) -> bytes:
    """SHA-256 pre-hash with base64 encoding to avoid bcrypt 72-byte limit and null-byte truncation."""
    return base64.b64encode(hashlib.sha256(password.encode("utf-8")).digest())


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(_prehash(password), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(_prehash(plain_password), hashed_password.encode("utf-8"))


TokenType = Literal["access", "refresh"]


@dataclass(frozen=True)
class DecodedToken:
    sub: str
    token_type: TokenType
    exp: int
    iat: int
    raw: dict[str, Any]


def create_jwt_token(
    *,
    subject: str,
    token_type: TokenType,
    expires_delta: timedelta,
    extra: dict[str, Any] | None = None,
) -> str:
    now = utcnow()
    exp = now + expires_delta
    payload: dict[str, Any] = {
        "sub": subject,
        "type": token_type,
        "jti": uuid.uuid4().hex,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_jwt_token(token: str) -> DecodedToken:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
            options={"verify_aud": False},
        )
    except JWTError as exc:  # includes ExpiredSignatureError
        raise UnauthorizedError("Invalid or expired token") from exc

    sub = payload.get("sub")
    token_type = payload.get("type")
    exp = payload.get("exp")
    iat = payload.get("iat")

    if not isinstance(sub, str) or token_type not in ("access", "refresh"):
        raise UnauthorizedError("Invalid token payload")
    if not isinstance(exp, int) or not isinstance(iat, int):
        raise UnauthorizedError("Invalid token payload")

    return DecodedToken(sub=sub, token_type=token_type, exp=exp, iat=iat, raw=payload)


def create_access_token(*, user_id: int) -> tuple[str, int]:
    expires = timedelta(minutes=settings.access_token_expire_minutes)
    token = create_jwt_token(subject=str(user_id), token_type="access", expires_delta=expires)
    return token, int(expires.total_seconds())


def create_refresh_token(*, user_id: int) -> tuple[str, int]:
    expires = timedelta(days=settings.refresh_token_expire_days)
    token = create_jwt_token(subject=str(user_id), token_type="refresh", expires_delta=expires)
    return token, int(expires.total_seconds())


def sign_download(*, file_id: str, filename: str, exp: int) -> str:
    msg = f"file_id={file_id}&fn={filename}&exp={exp}".encode("utf-8")
    secret = settings.download_signing_secret.encode("utf-8")
    digest = hmac.new(secret, msg, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def verify_download_signature(*, file_id: str, filename: str, exp: int, sig: str) -> bool:
    expected = sign_download(file_id=file_id, filename=filename, exp=exp)
    return hmac.compare_digest(expected, sig)
