from __future__ import annotations

import time

import pytest

from app.core.security import create_access_token
from app.models.card_code import CardCode
from app.schemas.photo import PhotoUploadResponse
from app.utils.hash_utils import sha256_hex


@pytest.mark.asyncio
async def test_api_auth_register_login_refresh_me(async_client) -> None:
    email = f"api-auth-{int(time.time() * 1000)}@example.com"
    password = "password123"

    register_res = await async_client.post("/api/auth/register", json={"email": email, "password": password})
    assert register_res.status_code == 200
    register_payload = register_res.json()
    access_token = register_payload["tokens"]["access_token"]

    me_res = await async_client.get("/api/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert me_res.status_code == 200
    assert me_res.json()["email"] == email

    login_res = await async_client.post("/api/auth/login", json={"email": email, "password": password})
    assert login_res.status_code == 200

    # Refresh token is in HttpOnly cookie; extract and send explicitly.
    refresh_cookie = register_res.cookies.get("toolii_refresh")
    assert refresh_cookie, "Expected toolii_refresh cookie in register response"
    refresh_res = await async_client.post(
        "/api/auth/refresh",
        cookies={"toolii_refresh": refresh_cookie},
    )
    assert refresh_res.status_code == 200
    assert refresh_res.json()["tokens"]["access_token"]


@pytest.mark.asyncio
async def test_api_credits_redeem_balance_transactions(
    async_client,
    session_factory,
    create_user,
) -> None:
    user = await create_user(email=f"api-credits-{int(time.time() * 1000)}@example.com", balance=0, email_verified=True)
    access_token, _ = create_access_token(user_id=user.id)
    headers = {"Authorization": f"Bearer {access_token}"}

    code = "TOOL-ABCD-EFGH-JKLM"
    async with session_factory() as db:
        db.add(CardCode(code_hash=sha256_hex(code), credits=4, card_type="test", status="unused"))
        await db.commit()

    redeem_res = await async_client.post("/api/credits/redeem", json={"code": code}, headers=headers)
    assert redeem_res.status_code == 200
    assert redeem_res.json()["added_credits"] == 4

    balance_res = await async_client.get("/api/credits/balance", headers=headers)
    assert balance_res.status_code == 200
    assert balance_res.json()["balance"] == 4

    tx_res = await async_client.get("/api/credits/transactions?limit=20", headers=headers)
    assert tx_res.status_code == 200
    assert tx_res.json()["total"] >= 1


@pytest.mark.asyncio
async def test_api_credits_redeem_invalid_format(
    async_client,
    create_user,
) -> None:
    user = await create_user(email=f"api-credits-format-{int(time.time() * 1000)}@example.com", balance=0, email_verified=True)
    access_token, _ = create_access_token(user_id=user.id)
    headers = {"Authorization": f"Bearer {access_token}"}

    res = await async_client.post("/api/credits/redeem", json={"code": "INVALID-CODE"}, headers=headers)
    assert res.status_code == 422
    payload = res.json()
    assert payload["code"] == "VALIDATION_ERROR"
    assert "String should match pattern" in payload["details"][0]["msg"]


@pytest.mark.asyncio
async def test_api_credits_redeem_accepts_lowercase_and_blocks_reuse(
    async_client,
    session_factory,
    create_user,
) -> None:
    user = await create_user(email=f"api-credits-reuse-{int(time.time() * 1000)}@example.com", balance=0, email_verified=True)
    access_token, _ = create_access_token(user_id=user.id)
    headers = {"Authorization": f"Bearer {access_token}"}

    code = "TOOL-QWER-ASDF-ZXCV"
    async with session_factory() as db:
        db.add(CardCode(code_hash=sha256_hex(code), credits=2, card_type="test", status="unused"))
        await db.commit()

    redeem_res = await async_client.post("/api/credits/redeem", json={"code": code.lower()}, headers=headers)
    assert redeem_res.status_code == 200
    assert redeem_res.json()["added_credits"] == 2

    duplicate_res = await async_client.post("/api/credits/redeem", json={"code": code}, headers=headers)
    assert duplicate_res.status_code == 409
    assert duplicate_res.json()["code"] == "CARD_CODE_USED"


@pytest.mark.asyncio
async def test_api_photo_upload_endpoint(
    async_client,
    monkeypatch: pytest.MonkeyPatch,
    sample_image_bytes,
) -> None:
    from app.services.photo_service import PhotoService

    async def _fake_upload_and_prepare(self, *, image_bytes: bytes, filename: str, content_type: str):  # noqa: ARG001
        return PhotoUploadResponse(
            upload_id="test-upload-id",
            filename=filename,
            width=800,
            height=1000,
            faces=[{"x": 260, "y": 140, "w": 280, "h": 360, "confidence": 0.9}],
            detection_engine="test-engine",
            compliance={"passed": True, "score": 90, "checks": []},
        )

    monkeypatch.setattr(PhotoService, "upload_and_prepare", _fake_upload_and_prepare)

    res = await async_client.post(
        "/api/photo/upload",
        files={"file": ("sample.png", sample_image_bytes, "image/png")},
    )
    assert res.status_code == 200
    payload = res.json()
    assert payload["upload_id"] == "test-upload-id"
    assert payload["faces"][0]["w"] == 280
