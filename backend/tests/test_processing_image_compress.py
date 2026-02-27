from __future__ import annotations

import io

import pytest
from PIL import Image

from app.processing.image_compress import compress_image


def _make_image_bytes(*, size: tuple[int, int] = (1200, 900)) -> bytes:
    image = Image.new("RGB", size, (255, 255, 255))
    for x in range(0, size[0], 20):
        for y in range(0, size[1], 20):
            image.putpixel((x, y), ((x * 7) % 255, (y * 5) % 255, ((x + y) * 3) % 255))
    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


def test_compress_image_returns_target_mime() -> None:
    image_bytes = _make_image_bytes()
    compressed, mime = compress_image(image_bytes, output_format="jpeg", quality=70)
    assert mime == "image/jpeg"
    assert len(compressed) > 0


def test_compress_image_with_target_size_binary_search() -> None:
    image_bytes = _make_image_bytes(size=(1600, 1200))
    compressed, mime = compress_image(image_bytes, output_format="jpeg", max_bytes=220_000)
    assert mime in {"image/jpeg", "image/webp"}
    assert len(compressed) <= 260_000


def test_compress_image_rejects_unsupported_format() -> None:
    image_bytes = _make_image_bytes()
    with pytest.raises(ValueError):
        compress_image(image_bytes, output_format="pngx")  # type: ignore[arg-type]
