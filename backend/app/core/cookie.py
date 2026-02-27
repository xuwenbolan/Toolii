from __future__ import annotations

from starlette.responses import Response

from app.core.config import settings

_COOKIE_NAME = "toolii_refresh"
_COOKIE_PATH = "/api/auth"


def set_refresh_cookie(response: Response, refresh_token: str, max_age: int) -> None:
    """Set HttpOnly refresh token cookie on the response."""
    response.set_cookie(
        key=_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=settings.env != "dev",
        samesite="lax",
        path=_COOKIE_PATH,
        max_age=max_age,
    )


def clear_refresh_cookie(response: Response) -> None:
    """Delete the refresh token cookie."""
    response.delete_cookie(
        key=_COOKIE_NAME,
        httponly=True,
        secure=settings.env != "dev",
        samesite="lax",
        path=_COOKIE_PATH,
    )


def get_refresh_cookie_name() -> str:
    return _COOKIE_NAME
