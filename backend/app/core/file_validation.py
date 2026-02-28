from __future__ import annotations

import io
import struct

from app.core.exceptions import AppError

_MIN_FILE_SIZE = 12
_MAX_DIMENSION = 10_000  # Max width/height in pixels


def _check_png_dimensions(data: bytes) -> None:
    """Read dimensions from PNG IHDR chunk (bytes 16-23)."""
    if len(data) < 24:
        return
    w, h = struct.unpack(">II", data[16:24])
    if w > _MAX_DIMENSION or h > _MAX_DIMENSION:
        raise AppError(code="IMAGE_TOO_LARGE", message="Image dimensions exceed limit", status_code=400)


def _check_jpeg_dimensions(data: bytes) -> None:
    """Scan JPEG markers for SOF to read dimensions without full decode."""
    try:
        from PIL import Image, UnidentifiedImageError
        with Image.open(io.BytesIO(data)) as img:
            w, h = img.size
        if w > _MAX_DIMENSION or h > _MAX_DIMENSION:
            raise AppError(code="IMAGE_TOO_LARGE", message="Image dimensions exceed limit", status_code=400)
    except AppError:
        raise
    except (OSError, UnidentifiedImageError, SyntaxError):
        # Corrupt or truncated JPEG — skip dimension check, let processing catch it
        pass


def validate_image_bytes(data: bytes) -> None:
    """Raise AppError if *data* does not look like a supported image."""
    if len(data) < _MIN_FILE_SIZE:
        raise AppError(code="INVALID_FILE", message="File too small to be a valid image", status_code=400)

    # JPEG: FF D8 FF
    if data[:3] == b"\xff\xd8\xff":
        _check_jpeg_dimensions(data)
        return
    # PNG: 89 50 4E 47 0D 0A 1A 0A
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        _check_png_dimensions(data)
        return
    # WebP: RIFF....WEBP
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return
    # GIF: GIF87a / GIF89a
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return
    # BMP: BM
    if data[:2] == b"BM":
        return
    # TIFF: II (little-endian) or MM (big-endian)
    if data[:4] in (b"II\x2a\x00", b"MM\x00\x2a"):
        return
    # HEIF / HEIC: ftyp box with known brands
    if data[4:8] == b"ftyp":
        brand = data[8:12].lower()
        if brand in (b"heic", b"mif1", b"msf1", b"heix", b"hevc"):
            return

    raise AppError(code="INVALID_FILE_TYPE", message="Unsupported image format", status_code=400)


def validate_pdf_bytes(data: bytes) -> None:
    """Raise AppError if *data* does not start with a PDF signature."""
    if len(data) < 5 or data[:5] != b"%PDF-":
        raise AppError(code="INVALID_FILE_TYPE", message="Not a valid PDF file", status_code=400)
