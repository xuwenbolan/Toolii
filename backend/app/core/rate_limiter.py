from __future__ import annotations

import time

from fastapi import FastAPI, Request
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address
from starlette.responses import JSONResponse

from app.core.config import settings
from app.core.security import decode_jwt_token

# ---------------------------------------------------------------------------
# IP ban state for repeat rate-limit offenders
# ---------------------------------------------------------------------------
_BAN_THRESHOLD = 5          # rate-limit hits within window
_BAN_WINDOW = 300.0         # 5 minutes
_BAN_DURATION = 600.0       # 10 minutes

_violations: dict[str, list[float]] = {}
_banned: dict[str, float] = {}


def _is_banned(ip: str) -> bool:
    """Return True if *ip* is temporarily banned."""
    banned_until = _banned.get(ip)
    if banned_until is None:
        return False
    if banned_until > time.monotonic():
        return True
    del _banned[ip]
    return False


def _record_violation(ip: str) -> None:
    """Record a rate-limit violation; ban after repeated offenses."""
    now = time.monotonic()
    hits = _violations.setdefault(ip, [])
    hits.append(now)
    cutoff = now - _BAN_WINDOW
    _violations[ip] = [t for t in hits if t > cutoff]
    if len(_violations[ip]) >= _BAN_THRESHOLD:
        _banned[ip] = now + _BAN_DURATION
        del _violations[ip]


# ---------------------------------------------------------------------------
# Rate-limit key resolver
# ---------------------------------------------------------------------------
def rate_limit_key(request: Request) -> str:
    auth = request.headers.get("authorization")
    if auth and auth.lower().startswith("bearer "):
        token = auth.split(" ", 1)[1].strip()
        try:
            decoded = decode_jwt_token(token)
            if decoded.token_type == "access":
                return f"user:{decoded.sub}"
        except Exception:  # noqa: BLE001
            pass
    return get_remote_address(request)


limiter = Limiter(key_func=rate_limit_key)


def dynamic_rate_limit(key: str) -> str:
    if key.startswith("user:"):
        return settings.rate_limit_auth
    return settings.rate_limit_anon


def register_rate_limiter(app: FastAPI) -> None:
    app.add_middleware(SlowAPIMiddleware)

    @app.middleware("http")
    async def _ban_check(request: Request, call_next):  # type: ignore[no-untyped-def]
        ip = get_remote_address(request)
        if _is_banned(ip):
            return JSONResponse(
                status_code=403,
                content={"code": "IP_BANNED", "message": "Temporarily banned due to abuse"},
            )
        return await call_next(request)

    @app.exception_handler(RateLimitExceeded)
    async def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:  # noqa: ARG001
        ip = get_remote_address(request)
        _record_violation(ip)
        return JSONResponse(
            status_code=429,
            content={"code": "RATE_LIMITED", "message": "请求过于频繁，请稍后再试"},
        )
