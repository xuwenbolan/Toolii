from __future__ import annotations

import os
import re

from app.core.exceptions import AppError

# Blocked extensions (executables, scripts, dangerous)
_BLOCKED_EXTENSIONS = frozenset({
    ".exe", ".bat", ".cmd", ".com", ".msi", ".scr", ".pif",
    ".vbs", ".vbe", ".js", ".jse", ".wsf", ".wsh", ".ps1",
    ".sh", ".bash", ".csh", ".ksh",
    ".app", ".action", ".command",
    ".dll", ".sys", ".drv",
    ".inf", ".reg",
    ".lnk", ".url",
    ".htaccess", ".htpasswd",
})

_BLOCKED_MIMES = frozenset({
    "application/x-msdownload",
    "application/x-msdos-program",
    "application/x-executable",
    "application/x-sh",
    "application/x-shellscript",
})

_MAX_FILENAME_LENGTH = 255

# Dangerous patterns: path traversal, null bytes, control chars
_DANGEROUS_PATTERN = re.compile(r"[/\\]|\.\.|[\x00-\x1f\x7f]")


def validate_transfer_file(
    *, filename: str, content_type: str, size: int, max_file_bytes: int
) -> None:
    if size > max_file_bytes:
        raise AppError(
            code="FILE_TOO_LARGE", message="File too large", status_code=413
        )

    if len(filename) > _MAX_FILENAME_LENGTH:
        raise AppError(
            code="INVALID_FILENAME", message="Filename too long", status_code=400
        )

    # Reject path traversal attempts and control characters
    if _DANGEROUS_PATTERN.search(filename):
        raise AppError(
            code="INVALID_FILENAME",
            message="Filename contains invalid characters",
            status_code=400,
        )

    # Extra safety: extract basename in case of path-like filenames
    basename = os.path.basename(filename)
    if not basename or basename.startswith("."):
        raise AppError(
            code="INVALID_FILENAME",
            message="Invalid filename",
            status_code=400,
        )

    lower_name = basename.lower()

    # Check all extensions in the filename (e.g., file.pdf.sh -> block .sh)
    parts = lower_name.split(".")
    if len(parts) > 1:
        for part in parts[1:]:
            ext = f".{part}"
            if ext in _BLOCKED_EXTENSIONS:
                raise AppError(
                    code="BLOCKED_FILE_TYPE",
                    message=f"File type {ext} is not allowed",
                    status_code=400,
                )

    if content_type.lower() in _BLOCKED_MIMES:
        raise AppError(
            code="BLOCKED_FILE_TYPE",
            message="This file type is not allowed",
            status_code=400,
        )
