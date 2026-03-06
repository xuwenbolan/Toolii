"""Unified file response helper with optional Nginx X-Accel-Redirect support.

When USE_X_ACCEL_REDIRECT is enabled (production behind Nginx), responses use
the X-Accel-Redirect header so Nginx serves the file directly — enabling HTTP
Range requests, sendfile(2), and freeing the Python worker immediately.

In development (default), falls back to Starlette FileResponse.
"""

from __future__ import annotations

from pathlib import Path
from urllib.parse import quote

from fastapi.responses import FileResponse, Response
from starlette.background import BackgroundTask

from app.core.config import settings


def file_response(
    path: str | Path,
    *,
    media_type: str,
    filename: str | None = None,
    headers: dict[str, str] | None = None,
    background: BackgroundTask | None = None,
) -> Response:
    """Return either an X-Accel-Redirect response or a plain FileResponse."""
    extra_headers = dict(headers) if headers else {}

    if settings.use_x_accel_redirect:
        accel_uri = _to_accel_uri(path)
        extra_headers["X-Accel-Redirect"] = accel_uri
        extra_headers["Content-Type"] = media_type
        if filename:
            encoded = quote(filename, safe="")
            extra_headers["Content-Disposition"] = (
                f"attachment; filename*=UTF-8''{encoded}"
            )
        return Response(
            content=b"",
            status_code=200,
            headers=extra_headers,
            background=background,
        )

    return FileResponse(
        path,
        media_type=media_type,
        filename=filename,
        headers=extra_headers or None,
        background=background,
    )


def _to_accel_uri(path: str | Path) -> str:
    """Convert an absolute filesystem path to an Nginx internal URI.

    Example: /app/data/files/ab/cd/abcdef -> /internal-data/files/ab/cd/abcdef
    """
    abs_path = str(Path(path).resolve())
    data_root = str(Path(settings.data_dir).resolve()) + "/"

    if not abs_path.startswith(data_root):
        raise ValueError(
            f"Path {abs_path} is not under data_dir {data_root}"
        )

    relative = abs_path[len(data_root):]
    return settings.x_accel_prefix + "/" + relative
