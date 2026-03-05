from __future__ import annotations

from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

import pytest

from app.core.config import settings
from app.schemas.image import FileResult as ImageFileResult
from app.services.file_service import FileService
from app.services.image_service import ImageService

# Minimal valid JPEG bytes (starts with FF D8 FF)
_JPEG_STUB = b"\xff\xd8\xff\xe0" + b"\x00" * 20
# Minimal valid PDF bytes
_PDF_STUB = b"%PDF-1.4 fake content"


def _replace_query_value(url: str, key: str, value: str) -> str:
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    query[key] = [value]
    return urlunparse(parsed._replace(query=urlencode(query, doseq=True)))


@pytest.mark.asyncio
async def test_cors_whitelist_and_block(async_client) -> None:
    allowed_origin = settings.cors_origins[0]
    allowed_headers = {
        "Origin": allowed_origin,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization",
    }
    allowed_response = await async_client.options("/api/health", headers=allowed_headers)
    assert allowed_response.status_code in (200, 204)
    assert allowed_response.headers.get("access-control-allow-origin") == allowed_origin

    blocked_response = await async_client.options(
        "/api/health",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert blocked_response.status_code in (200, 400)
    assert blocked_response.headers.get("access-control-allow-origin") is None


@pytest.mark.asyncio
async def test_rate_limiting_for_anonymous_requests(async_client, monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_compress(  # noqa: ARG001
        self,
        *,
        image_bytes: bytes,
        filename: str,
        quality: int | None = None,
        target_kb: int | None = None,
        output_format: str | None = None,
        credit_cost: int = 0,
    ) -> ImageFileResult:
        return ImageFileResult(
            file_id="fake",
            filename=filename,
            size=123,
            content_type="image/jpeg",
            download_url="/api/download/fake?fn=fake.jpg&exp=1&sig=fake",
            expires_in=3600,
        )

    monkeypatch.setattr(ImageService, "compress", _fake_compress)

    for _ in range(10):
        ok = await async_client.post(
            "/api/image/compress",
            files={"file": ("small.jpg", _JPEG_STUB, "image/jpeg")},
        )
        assert ok.status_code == 200

    limited = await async_client.post(
        "/api/image/compress",
        files={"file": ("small.jpg", _JPEG_STUB, "image/jpeg")},
    )
    assert limited.status_code == 429
    assert limited.json()["code"] == "RATE_LIMITED"


@pytest.mark.asyncio
async def test_upload_size_limits_enforced(async_client, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "max_upload_image_mb", 1)
    monkeypatch.setattr(settings, "max_upload_pdf_mb", 1)

    oversized_payload = b"x" * (1024 * 1024 + 1)

    image_res = await async_client.post(
        "/api/image/compress",
        files={"file": ("too-large.jpg", oversized_payload, "image/jpeg")},
    )
    assert image_res.status_code == 413
    assert image_res.json()["message"] == "File too large"

    pdf_res = await async_client.post(
        "/api/pdf/compress",
        files={"file": ("too-large.pdf", oversized_payload, "application/pdf")},
    )
    assert pdf_res.status_code == 413
    assert pdf_res.json()["message"] == "File too large"


@pytest.mark.asyncio
async def test_signed_download_url_success_tamper_and_expire(async_client) -> None:
    service = FileService()
    stored = service.save_bytes(data=b"hello-toolii", filename="demo.txt", content_type="text/plain")
    signed_url = service.build_download_url(
        file_id=stored.file_id,
        filename=stored.original_filename,
        ttl_seconds=120,
    )

    ok = await async_client.get(signed_url)
    assert ok.status_code == 200
    assert ok.content == b"hello-toolii"

    tampered = await async_client.get(_replace_query_value(signed_url, "sig", "invalid-signature"))
    assert tampered.status_code == 403

    expired_url = service.build_download_url(
        file_id=stored.file_id,
        filename=stored.original_filename,
        ttl_seconds=-1,
    )
    expired = await async_client.get(expired_url)
    assert expired.status_code == 410
