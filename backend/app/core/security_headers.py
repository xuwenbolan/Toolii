from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

_SECURITY_HEADERS: dict[str, str] = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    # Disable legacy XSS auditor; rely on CSP instead.
    "X-XSS-Protection": "0",
    "Content-Security-Policy": (
        "default-src 'self'; "
        "script-src 'self' https://www.googletagmanager.com https://accounts.google.com https://apis.google.com; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob: https://www.google-analytics.com https://www.gstatic.com; "
        "font-src 'self'; "
        "connect-src 'self' https://www.google-analytics.com https://www.googletagmanager.com https://*.analytics.google.com https://accounts.google.com https://*.googleapis.com; "
        "frame-src 'self' https://accounts.google.com https://*.google.com; "
        "frame-ancestors 'none'"
    ),
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add standard security headers to every response."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        for name, value in _SECURITY_HEADERS.items():
            response.headers.setdefault(name, value)
        return response


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject requests whose Content-Length exceeds *max_bytes*."""

    def __init__(self, app: object, max_bytes: int = 550 * 1024 * 1024) -> None:
        super().__init__(app)  # type: ignore[arg-type]
        self._max_bytes = max_bytes

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        content_length = request.headers.get("content-length")
        if content_length is not None:
            try:
                if int(content_length) > self._max_bytes:
                    return Response(
                        content='{"code":"PAYLOAD_TOO_LARGE","message":"Request body too large"}',
                        status_code=413,
                        media_type="application/json",
                    )
            except ValueError:
                pass
        return await call_next(request)
