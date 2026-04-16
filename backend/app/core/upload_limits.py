"""Shared upload size limit helpers used across routers."""

from __future__ import annotations

from app.core.config import settings


def max_image_bytes() -> int:
    return settings.max_upload_image_mb * 1024 * 1024


def max_pdf_bytes() -> int:
    return settings.max_upload_pdf_mb * 1024 * 1024


def max_docx_bytes() -> int:
    return settings.max_upload_docx_mb * 1024 * 1024
