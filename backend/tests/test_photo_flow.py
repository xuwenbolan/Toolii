"""End-to-end integration tests for the photo processing flow.

Covers: upload → process → export / layout.
Heavy processing (background removal, ML face detection) is mocked so tests
run without GPU or large models.
"""

from __future__ import annotations

import io
import time

import pytest
from PIL import Image

from app.core.security import create_access_token
from app.schemas.photo import PhotoPreviewResponse, PhotoStandard, PhotoUploadResponse


def _make_face_image() -> bytes:
    """Generate a synthetic 800x1000 JPEG image."""
    img = Image.new("RGB", (800, 1000), color=(200, 180, 160))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def _make_cutout_png(w: int = 800, h: int = 1000) -> bytes:
    """Generate a synthetic RGBA PNG simulating a background-removed subject."""
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    # Draw a centered opaque rectangle to simulate a person.
    for y in range(int(h * 0.05), int(h * 0.95)):
        for x in range(int(w * 0.2), int(w * 0.8)):
            img.putpixel((x, y), (200, 180, 160, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture()
def face_image_bytes():
    return _make_face_image()


@pytest.fixture()
def _mock_processing(monkeypatch):
    """Mock heavy processing functions so tests don't need ML models."""
    import app.services.cortex_client as cortex
    import app.services.photo_service as photo_svc

    face_result = {
        "faces": [{"x": 260, "y": 140, "w": 280, "h": 360, "confidence": 0.92}],
        "width": 800,
        "height": 1000,
        "engine": "test-mock",
    }
    cutout = _make_cutout_png()

    async def _fake_detect(image_bytes):
        return face_result

    async def _fake_remove(image_bytes):
        return cutout, {"model": "ben2", "engine": "test-mock"}

    def _fake_compliance(image_bytes, *, faces=None, cutout_png_bytes=None, detection_engine=None):
        return {
            "passed": True,
            "score": 90,
            "checks": [
                {"id": "face_detected", "label": "Face detected", "passed": True, "severity": "error", "message": "OK"},
            ],
        }

    # cortex_client functions are imported inside the method, patch at source
    monkeypatch.setattr(cortex, "detect_faces", _fake_detect)
    monkeypatch.setattr(cortex, "remove_background", _fake_remove)
    # check_photo_compliance is imported at module level in photo_service
    monkeypatch.setattr(photo_svc, "check_photo_compliance", _fake_compliance)


@pytest.mark.asyncio
@pytest.mark.usefixtures("_mock_processing")
async def test_photo_upload_and_preview(
    async_client,
    face_image_bytes,
) -> None:
    """Upload an image (with bg removal) and generate a preview."""
    # Step 1: Upload (now includes face detection + bg removal + compliance)
    upload_res = await async_client.post(
        "/api/photo/upload",
        files={"file": ("portrait.jpg", face_image_bytes, "image/jpeg")},
    )
    assert upload_res.status_code == 200
    upload_data = upload_res.json()
    assert upload_data["upload_id"]
    assert upload_data["width"] == 800
    assert len(upload_data["faces"]) == 1
    assert upload_data["compliance"]["passed"] is True

    # Step 2: Preview (lightweight crop + composite)
    preview_res = await async_client.post(
        "/api/photo/preview",
        json={
            "upload_id": upload_data["upload_id"],
            "standard": "cn-passport",
            "background_color": "#FFFFFF",
        },
    )
    assert preview_res.status_code == 200
    preview_data = preview_res.json()
    assert preview_data["processed_id"]
    assert preview_data["preview_data_url"].startswith("data:image/png;base64,")
    assert preview_data["output_width"] > 0
    assert preview_data["output_height"] > 0
    assert preview_data["compliance"]["checks"]


@pytest.mark.asyncio
@pytest.mark.usefixtures("_mock_processing")
async def test_photo_export_requires_credits(
    async_client,
    session_factory,
    create_user,
    face_image_bytes,
) -> None:
    """Export requires credits; should fail with 0 balance and succeed with credits."""
    user = await create_user(email=f"photo-export-{int(time.time() * 1000)}@example.com", balance=0)
    token, _ = create_access_token(user_id=user.id)
    headers = {"Authorization": f"Bearer {token}"}

    # Upload and preview
    upload_res = await async_client.post(
        "/api/photo/upload",
        files={"file": ("portrait.jpg", face_image_bytes, "image/jpeg")},
    )
    upload_data = upload_res.json()

    preview_res = await async_client.post(
        "/api/photo/preview",
        json={
            "upload_id": upload_data["upload_id"],
            "standard": "cn-passport",
            "background_color": "#FFFFFF",
        },
    )
    processed_id = preview_res.json()["processed_id"]

    # Export with 0 credits should fail
    export_res = await async_client.post(
        "/api/photo/export",
        json={"processed_id": processed_id},
        headers=headers,
    )
    assert export_res.status_code == 402

    # Give user credits and retry
    user_with_credits = await create_user(
        email=f"photo-export-ok-{int(time.time() * 1000)}@example.com", balance=5
    )
    token2, _ = create_access_token(user_id=user_with_credits.id)
    headers2 = {"Authorization": f"Bearer {token2}"}

    export_res2 = await async_client.post(
        "/api/photo/export",
        json={"processed_id": processed_id},
        headers=headers2,
    )
    assert export_res2.status_code == 200
    export_data = export_res2.json()
    assert export_data["download_url"]
    assert export_data["file_id"]

    # Second export of the same processed_id should be free (no double charge)
    balance_res = await async_client.get("/api/credits/balance", headers=headers2)
    balance_after_first = balance_res.json()["balance"]

    export_res3 = await async_client.post(
        "/api/photo/export",
        json={"processed_id": processed_id},
        headers=headers2,
    )
    assert export_res3.status_code == 200

    balance_res2 = await async_client.get("/api/credits/balance", headers=headers2)
    assert balance_res2.json()["balance"] == balance_after_first


@pytest.mark.asyncio
@pytest.mark.usefixtures("_mock_processing")
async def test_photo_layout_export(
    async_client,
    session_factory,
    create_user,
    face_image_bytes,
) -> None:
    """Layout export charges 1 credit and shares payment with export."""
    user = await create_user(
        email=f"photo-layout-{int(time.time() * 1000)}@example.com", balance=10
    )
    token, _ = create_access_token(user_id=user.id)
    headers = {"Authorization": f"Bearer {token}"}

    # Upload -> preview
    upload_res = await async_client.post(
        "/api/photo/upload",
        files={"file": ("portrait.jpg", face_image_bytes, "image/jpeg")},
    )
    preview_res = await async_client.post(
        "/api/photo/preview",
        json={
            "upload_id": upload_res.json()["upload_id"],
            "standard": "cn-passport",
            "background_color": "#438EDB",
        },
    )
    processed_id = preview_res.json()["processed_id"]

    # Layout (first call) should charge 1 credit
    layout_res = await async_client.post(
        "/api/photo/layout",
        json={"processed_id": processed_id, "copies": 4},
        headers=headers,
    )
    assert layout_res.status_code == 200
    layout_data = layout_res.json()
    assert layout_data["file_id"]
    assert layout_data["download_url"]
    assert "layout" in layout_data["filename"]

    balance_res = await async_client.get("/api/credits/balance", headers=headers)
    assert balance_res.json()["balance"] == 9  # 10 - 1

    # Export same processed_id should be FREE (already paid via layout)
    export_res = await async_client.post(
        "/api/photo/export",
        json={"processed_id": processed_id},
        headers=headers,
    )
    assert export_res.status_code == 200

    balance_res2 = await async_client.get("/api/credits/balance", headers=headers)
    assert balance_res2.json()["balance"] == 9  # still 9


@pytest.mark.asyncio
@pytest.mark.usefixtures("_mock_processing")
async def test_photo_export_then_layout_free(
    async_client,
    session_factory,
    create_user,
    face_image_bytes,
) -> None:
    """Export first charges 1 credit, then layout for the same photo is free."""
    user = await create_user(
        email=f"photo-cross-{int(time.time() * 1000)}@example.com", balance=5
    )
    token, _ = create_access_token(user_id=user.id)
    headers = {"Authorization": f"Bearer {token}"}

    upload_res = await async_client.post(
        "/api/photo/upload",
        files={"file": ("portrait.jpg", face_image_bytes, "image/jpeg")},
    )
    preview_res = await async_client.post(
        "/api/photo/preview",
        json={
            "upload_id": upload_res.json()["upload_id"],
            "standard": "cn-passport",
            "background_color": "#FFFFFF",
        },
    )
    processed_id = preview_res.json()["processed_id"]

    # Export first - charges 1 credit
    export_res = await async_client.post(
        "/api/photo/export",
        json={"processed_id": processed_id},
        headers=headers,
    )
    assert export_res.status_code == 200

    balance_res = await async_client.get("/api/credits/balance", headers=headers)
    assert balance_res.json()["balance"] == 4  # 5 - 1

    # Layout same processed_id - should be free
    layout_res = await async_client.post(
        "/api/photo/layout",
        json={"processed_id": processed_id, "copies": 4},
        headers=headers,
    )
    assert layout_res.status_code == 200

    balance_res2 = await async_client.get("/api/credits/balance", headers=headers)
    assert balance_res2.json()["balance"] == 4  # still 4


@pytest.mark.asyncio
@pytest.mark.usefixtures("_mock_processing")
async def test_photo_layout_requires_credits(
    async_client,
    session_factory,
    create_user,
    face_image_bytes,
) -> None:
    """Layout should fail with 402 when user has no credits and no prior payment."""
    user = await create_user(
        email=f"photo-layout-nocredit-{int(time.time() * 1000)}@example.com", balance=0
    )
    token, _ = create_access_token(user_id=user.id)
    headers = {"Authorization": f"Bearer {token}"}

    upload_res = await async_client.post(
        "/api/photo/upload",
        files={"file": ("portrait.jpg", face_image_bytes, "image/jpeg")},
    )
    preview_res = await async_client.post(
        "/api/photo/preview",
        json={
            "upload_id": upload_res.json()["upload_id"],
            "standard": "cn-passport",
            "background_color": "#FFFFFF",
        },
    )
    processed_id = preview_res.json()["processed_id"]

    layout_res = await async_client.post(
        "/api/photo/layout",
        json={"processed_id": processed_id},
        headers=headers,
    )
    assert layout_res.status_code == 402


@pytest.mark.asyncio
async def test_photo_preview_invalid_upload_id(async_client) -> None:
    """Preview with a non-existent upload should return 404."""
    res = await async_client.post(
        "/api/photo/preview",
        json={
            "upload_id": "nonexistent-id",
            "standard": "cn-passport",
            "background_color": "#FFFFFF",
        },
    )
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_photo_standards_endpoint(async_client) -> None:
    """Standards endpoint returns available photo standards."""
    res = await async_client.get("/api/photo/standards")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) > 0
    assert "code" in data[0]
    assert "width_mm" in data[0]
