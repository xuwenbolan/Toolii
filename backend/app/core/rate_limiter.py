from __future__ import annotations

from fastapi import FastAPI, Request
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address
from starlette.responses import JSONResponse

from app.core.security import decode_jwt_token
from app.core.config import settings


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

    @app.exception_handler(RateLimitExceeded)
    async def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:  # noqa: ARG001
        return JSONResponse(
            status_code=429,
            content={"code": "RATE_LIMITED", "message": "请求过于频繁，请稍后再试"},
        )
