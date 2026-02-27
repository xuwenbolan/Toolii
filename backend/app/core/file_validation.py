from __future__ import annotations

from app.core.exceptions import AppError

_MIN_FILE_SIZE = 12


def validate_image_bytes(data: bytes) -> None:
    """Raise AppError if *data* does not look like a supported image."""
    if len(data) < _MIN_FILE_SIZE:
        raise AppError(code="INVALID_FILE", message="File too small to be a valid image", status_code=400)

    # JPEG: FF D8 FF
    if data[:3] == b"\xff\xd8\xff":
        return
    # PNG: 89 50 4E 47 0D 0A 1A 0A
    if data[:8] == b"\x89PNG\r\n\x1a\n":
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
