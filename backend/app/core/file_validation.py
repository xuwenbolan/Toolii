from __future__ import annotations

import io
import struct

from app.core.exceptions import AppError

_MIN_FILE_SIZE = 12
_MAX_DIMENSION = 10_000  # Max width/height in pixels
_MAX_PIXELS = 30_000_000  # ~30MP, prevents OOM from decompression bombs


def check_cv2_image_size(img) -> None:  # type: ignore[no-untyped-def]
    """Check decoded cv2 image dimensions. Raises AppError if too large."""
    h, w = img.shape[:2]
    if w > _MAX_DIMENSION or h > _MAX_DIMENSION or w * h > _MAX_PIXELS:
        raise AppError(code="IMAGE_TOO_LARGE", message="Image dimensions exceed limit", status_code=400)


def _check_pillow_dimensions(data: bytes) -> None:
    """Generic dimension check using Pillow for any supported format."""
    try:
        from PIL import Image
        with Image.open(io.BytesIO(data)) as img:
            w, h = img.size
        if w > _MAX_DIMENSION or h > _MAX_DIMENSION:
            raise AppError(code="IMAGE_TOO_LARGE", message="Image dimensions exceed limit", status_code=400)
    except AppError:
        raise
    except Exception:
        pass


def _check_png_dimensions(data: bytes) -> None:
    """Read dimensions from PNG IHDR chunk (bytes 16-23)."""
    if len(data) < 24:
        return
    w, h = struct.unpack(">II", data[16:24])
    if w > _MAX_DIMENSION or h > _MAX_DIMENSION:
        raise AppError(code="IMAGE_TOO_LARGE", message="Image dimensions exceed limit", status_code=400)


def validate_image_bytes(data: bytes) -> None:
    """Raise AppError if *data* does not look like a supported image."""
    if len(data) < _MIN_FILE_SIZE:
        raise AppError(code="INVALID_FILE", message="File too small to be a valid image", status_code=400)

    # JPEG: FF D8 FF
    if data[:3] == b"\xff\xd8\xff":
        _check_pillow_dimensions(data)
        return
    # PNG: 89 50 4E 47 0D 0A 1A 0A
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        _check_png_dimensions(data)
        return
    # WebP: RIFF....WEBP
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        _check_pillow_dimensions(data)
        return
    # GIF: GIF87a / GIF89a
    if data[:6] in (b"GIF87a", b"GIF89a"):
        _check_pillow_dimensions(data)
        return
    # BMP: BM
    if data[:2] == b"BM":
        _check_pillow_dimensions(data)
        return
    # TIFF: II (little-endian) or MM (big-endian)
    if data[:4] in (b"II\x2a\x00", b"MM\x00\x2a"):
        _check_pillow_dimensions(data)
        return
    # HEIF / HEIC: ftyp box with known brands
    if data[4:8] == b"ftyp":
        brand = data[8:12].lower()
        if brand in (b"heic", b"mif1", b"msf1", b"heix", b"hevc"):
            _check_pillow_dimensions(data)
            return

    raise AppError(code="INVALID_FILE_TYPE", message="Unsupported image format", status_code=400)


def validate_pdf_bytes(data: bytes) -> None:
    """Raise AppError if *data* does not start with a PDF signature."""
    if len(data) < 5 or data[:5] != b"%PDF-":
        raise AppError(code="INVALID_FILE_TYPE", message="Not a valid PDF file", status_code=400)


def check_pdf_page_count(data: bytes, *, max_pages: int | None = None) -> int:
    """Return page count and raise AppError if it exceeds *max_pages*."""
    from PyPDF2 import PdfReader

    if max_pages is None:
        from app.core.config import settings
        max_pages = settings.max_pdf_pages

    reader = PdfReader(io.BytesIO(data))
    count = len(reader.pages)
    if count > max_pages:
        raise AppError(
            code="PDF_TOO_MANY_PAGES",
            message=f"PDF has {count} pages, exceeding the limit of {max_pages}",
            status_code=400,
        )
    return count
