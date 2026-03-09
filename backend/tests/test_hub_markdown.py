from __future__ import annotations

import pytest


async def _upload_markdown(async_client, headers: dict[str, str], *, filename: str = "notes.md", data: bytes = b"# Hello\n") -> int:
    res = await async_client.post(
        "/api/hub/upload",
        headers=headers,
        files=[("files", (filename, data, "text/markdown"))],
        data={"retention_days": "3"},
    )
    assert res.status_code == 200
    return res.json()["files"][0]["id"]


@pytest.mark.anyio
async def test_hub_markdown_content_roundtrip(async_client, auth_headers) -> None:
    headers = await auth_headers(email="md-roundtrip@example.com")
    file_id = await _upload_markdown(async_client, headers)

    meta_res = await async_client.get(f"/api/hub/files/{file_id}", headers=headers)
    assert meta_res.status_code == 200
    assert meta_res.json()["file_name"] == "notes.md"

    content_res = await async_client.get(f"/api/hub/files/{file_id}/content", headers=headers)
    assert content_res.status_code == 200
    assert content_res.json()["content"] == "# Hello\n"
    updated_at = content_res.json()["updated_at"]
    assert updated_at

    save_res = await async_client.put(
        f"/api/hub/files/{file_id}/content",
        headers=headers,
        json={"content": "# Hello\n\nUpdated.\n", "base_updated_at": updated_at},
    )
    assert save_res.status_code == 200
    assert save_res.json()["size"] == len("# Hello\n\nUpdated.\n".encode("utf-8"))
    assert save_res.json()["updated_at"]

    content_res2 = await async_client.get(f"/api/hub/files/{file_id}/content", headers=headers)
    assert content_res2.status_code == 200
    assert content_res2.json()["content"] == "# Hello\n\nUpdated.\n"


@pytest.mark.anyio
async def test_markdown_rename_rules(async_client, auth_headers) -> None:
    headers = await auth_headers(email="md-rename@example.com")
    file_id = await _upload_markdown(async_client, headers)

    rename_res = await async_client.patch(
        f"/api/hub/files/{file_id}",
        headers=headers,
        json={"file_name": "renamed"},
    )
    assert rename_res.status_code == 200
    assert rename_res.json()["file_name"] == "renamed.md"

    invalid_res = await async_client.patch(
        f"/api/hub/files/{file_id}",
        headers=headers,
        json={"file_name": "renamed.txt"},
    )
    assert invalid_res.status_code == 400
    assert invalid_res.json()["code"] == "INVALID_MARKDOWN_FILENAME"


@pytest.mark.anyio
async def test_markdown_content_conflict(async_client, auth_headers) -> None:
    headers = await auth_headers(email="md-conflict@example.com")
    file_id = await _upload_markdown(async_client, headers)

    content_res = await async_client.get(f"/api/hub/files/{file_id}/content", headers=headers)
    assert content_res.status_code == 200
    base_updated_at = content_res.json()["updated_at"]

    first_save = await async_client.put(
        f"/api/hub/files/{file_id}/content",
        headers=headers,
        json={"content": "# first\n", "base_updated_at": base_updated_at},
    )
    assert first_save.status_code == 200

    second_save = await async_client.put(
        f"/api/hub/files/{file_id}/content",
        headers=headers,
        json={"content": "# stale\n", "base_updated_at": base_updated_at},
    )
    assert second_save.status_code == 409
    assert second_save.json()["code"] == "CONTENT_CONFLICT"


@pytest.mark.anyio
async def test_markdown_invalid_binary_content(async_client, auth_headers) -> None:
    headers = await auth_headers(email="md-binary@example.com")
    file_id = await _upload_markdown(
        async_client,
        headers,
        filename="binary.md",
        data=b"\xff\xfe\xfd\xfc",
    )

    content_res = await async_client.get(f"/api/hub/files/{file_id}/content", headers=headers)
    assert content_res.status_code == 422
    assert content_res.json()["code"] == "INVALID_CONTENT"


@pytest.mark.anyio
async def test_share_markdown_preview_endpoint(async_client, auth_headers) -> None:
    headers = await auth_headers(email="md-share@example.com")
    file_id = await _upload_markdown(async_client, headers, data=b"# Shared\n")

    share_res = await async_client.post(
        "/api/hub/shares",
        headers=headers,
        json={"file_ids": [file_id], "use_extract_code": False},
    )
    assert share_res.status_code == 200
    token = share_res.json()["token"]

    preview_res = await async_client.get(f"/api/hub/s/{token}/{file_id}/content")
    assert preview_res.status_code == 200
    assert preview_res.json()["content"] == "# Shared\n"
    assert preview_res.json()["updated_at"] is None


@pytest.mark.anyio
async def test_share_markdown_preview_wrong_code_counts_attempts(async_client, auth_headers) -> None:
    headers = await auth_headers(email="md-share-code@example.com")
    file_id = await _upload_markdown(async_client, headers, data=b"# Shared\n")

    share_res = await async_client.post(
        "/api/hub/shares",
        headers=headers,
        json={"file_ids": [file_id], "use_extract_code": True},
    )
    assert share_res.status_code == 200
    token = share_res.json()["token"]

    wrong_code_res = await async_client.get(f"/api/hub/s/{token}/{file_id}/content", params={"code": "aaaaaa"})
    assert wrong_code_res.status_code == 403
    assert wrong_code_res.json()["code"] == "WRONG_CODE"

    info_res = await async_client.get(f"/api/hub/s/{token}/info", params={"code": "bbbbbb"})
    assert info_res.status_code == 403
    assert info_res.json()["code"] == "WRONG_CODE"
