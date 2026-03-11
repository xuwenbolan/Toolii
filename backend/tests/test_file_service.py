"""Integration tests for FileService (save, get, delete, thumbnail)."""

from __future__ import annotations

import pytest

from app.services.file_service import FileService, build_download_url


@pytest.fixture()
def file_service(tmp_path):
    return FileService(storage_dir=str(tmp_path / "files"))


class TestSaveAndGet:
    def test_save_and_get_roundtrip(self, file_service):
        data = b"hello world"
        stored = file_service.save_bytes(data)
        assert stored.file_id
        assert stored.size == len(data)

        path = file_service.get_path(stored.file_id)
        assert path.read_bytes() == data

    def test_get_nonexistent_raises(self, file_service):
        with pytest.raises(FileNotFoundError):
            file_service.get_path("a" * 32)

    def test_invalid_file_id_raises(self, file_service):
        with pytest.raises(FileNotFoundError):
            file_service.get_path("not-a-valid-hex-id")

    def test_overwrite_bytes(self, file_service):
        stored = file_service.save_bytes(b"original")
        new_size = file_service.overwrite_bytes(stored.file_id, b"updated")
        assert new_size == len(b"updated")
        assert file_service.get_path(stored.file_id).read_bytes() == b"updated"

    def test_delete(self, file_service):
        stored = file_service.save_bytes(b"to-delete")
        file_service.delete(stored.file_id)
        with pytest.raises(FileNotFoundError):
            file_service.get_path(stored.file_id)

    def test_delete_nonexistent_ok(self, file_service):
        # delete with valid hex ID should not raise even if file doesn't exist
        file_service.delete("b" * 32)


class TestDownloadUrl:
    def test_build_download_url_contains_signature(self, file_service):
        stored = file_service.save_bytes(b"data")
        url = build_download_url(file_id=stored.file_id, filename="doc.pdf")
        assert stored.file_id in url
        assert "sig=" in url
        assert "exp=" in url
        assert "fn=" in url
