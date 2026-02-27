"""Integration tests for ImageService (compress, convert, mosaic, scan_enhance)."""

from __future__ import annotations

import pytest

from app.services.image_service import ImageService


@pytest.fixture()
def image_service(tmp_path, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "file_storage_dir", str(tmp_path / "files"))
    return ImageService()


@pytest.fixture()
def jpeg_bytes():
    """Minimal valid JPEG image."""
    from PIL import Image
    import io

    img = Image.new("RGB", (200, 200), color=(128, 64, 32))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)
    return buf.getvalue()


@pytest.fixture()
def png_bytes():
    """Minimal valid PNG image."""
    from PIL import Image
    import io

    img = Image.new("RGBA", (200, 200), color=(128, 64, 32, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.mark.asyncio
async def test_compress_returns_smaller_file(image_service, jpeg_bytes):
    result = await image_service.compress(
        image_bytes=jpeg_bytes,
        filename="test.jpg",
        quality=30,
        target_kb=None,
        output_format=None,
    )
    assert result.file_id
    assert result.size > 0
    assert result.size <= len(jpeg_bytes)
    assert "compressed" in result.filename


@pytest.mark.asyncio
async def test_compress_with_target_kb(image_service, jpeg_bytes):
    result = await image_service.compress(
        image_bytes=jpeg_bytes,
        filename="test.jpg",
        quality=None,
        target_kb=2,
        output_format=None,
    )
    assert result.size <= 2 * 1024 + 512  # allow small tolerance


@pytest.mark.asyncio
async def test_convert_jpeg_to_png(image_service, jpeg_bytes):
    result = await image_service.convert(
        image_bytes=jpeg_bytes,
        filename="photo.jpg",
        output_format="png",
        quality=None,
    )
    assert result.content_type == "image/png"
    assert result.filename.endswith(".png")


@pytest.mark.asyncio
async def test_convert_png_to_webp(image_service, png_bytes):
    result = await image_service.convert(
        image_bytes=png_bytes,
        filename="photo.png",
        output_format="webp",
        quality=80,
    )
    assert result.content_type == "image/webp"
    assert result.filename.endswith(".webp")


@pytest.mark.asyncio
async def test_convert_rejects_invalid_format(image_service, jpeg_bytes):
    from app.core.exceptions import AppError

    with pytest.raises(AppError) as exc_info:
        await image_service.convert(
            image_bytes=jpeg_bytes,
            filename="photo.jpg",
            output_format="bmp",
            quality=None,
        )
    assert exc_info.value.code == "INVALID_OUTPUT_FORMAT"


@pytest.mark.asyncio
async def test_mosaic_produces_output(image_service, jpeg_bytes):
    regions = [{"x": 0.1, "y": 0.1, "w": 0.5, "h": 0.5}]
    result = await image_service.mosaic(
        image_bytes=jpeg_bytes,
        filename="photo.jpg",
        regions=regions,
        pixel_size=10,
    )
    assert result.file_id
    assert result.size > 0
    assert "mosaic" in result.filename


@pytest.mark.asyncio
async def test_scan_enhance_bw(image_service, jpeg_bytes):
    result = await image_service.scan_enhance(
        image_bytes=jpeg_bytes,
        filename="scan.jpg",
        mode="bw",
    )
    assert result.file_id
    assert result.size > 0
    assert "scan" in result.filename


@pytest.mark.asyncio
async def test_scan_enhance_rejects_invalid_mode(image_service, jpeg_bytes):
    from app.core.exceptions import AppError

    with pytest.raises(AppError) as exc_info:
        await image_service.scan_enhance(
            image_bytes=jpeg_bytes,
            filename="scan.jpg",
            mode="invalid",
        )
    assert exc_info.value.code == "INVALID_MODE"
