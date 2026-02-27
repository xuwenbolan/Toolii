"""Integration tests for FileService (save, get, download URL, cleanup)."""

from __future__ import annotations

import time

import pytest

from app.services.file_service import FileService


@pytest.fixture()
def file_service(tmp_path, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "file_storage_dir", str(tmp_path / "files"))
    return FileService()


class TestSaveAndGet:
    def test_save_and_get_roundtrip(self, file_service):
        data = b"hello world"
        stored = file_service.save_bytes(
            data=data, filename="test.txt", content_type="text/plain"
        )
        assert stored.file_id
        assert stored.size == len(data)
        assert stored.content_type == "text/plain"
        assert stored.original_filename == "test.txt"

        retrieved = file_service.get(stored.file_id)
        assert retrieved.file_id == stored.file_id
        assert retrieved.size == len(data)
        assert retrieved.path.read_bytes() == data

    def test_get_nonexistent_raises(self, file_service):
        with pytest.raises(FileNotFoundError):
            file_service.get("nonexistent-id-1234567890abcdef")

    def test_save_sanitizes_filename(self, file_service):
        stored = file_service.save_bytes(
            data=b"data", filename="../../../etc/passwd", content_type="text/plain"
        )
        assert stored.original_filename == "passwd"

    def test_save_empty_filename_gets_default(self, file_service):
        stored = file_service.save_bytes(
            data=b"data", filename="", content_type="application/octet-stream"
        )
        assert stored.original_filename == "download"


class TestDownloadUrl:
    def test_build_download_url_contains_signature(self, file_service):
        stored = file_service.save_bytes(
            data=b"data", filename="doc.pdf", content_type="application/pdf"
        )
        url = file_service.build_download_url(file_id=stored.file_id, filename="doc.pdf")
        assert stored.file_id in url
        assert "sig=" in url
        assert "exp=" in url
        assert "fn=" in url


class TestCleanup:
    def test_cleanup_removes_old_files(self, file_service, monkeypatch):
        from app.core.config import settings

        monkeypatch.setattr(settings, "file_retention_hours", 0)

        stored = file_service.save_bytes(
            data=b"old data", filename="old.txt", content_type="text/plain"
        )
        # Make the file appear old by backdating mtime.
        import os

        old_time = time.time() - 3600
        os.utime(stored.path, (old_time, old_time))

        removed = file_service.cleanup_expired_files()
        assert removed >= 1
        with pytest.raises(FileNotFoundError):
            file_service.get(stored.file_id)

    def test_cleanup_keeps_recent_files(self, file_service, monkeypatch):
        from app.core.config import settings

        monkeypatch.setattr(settings, "file_retention_hours", 24)

        stored = file_service.save_bytes(
            data=b"fresh data", filename="new.txt", content_type="text/plain"
        )
        removed = file_service.cleanup_expired_files()
        assert removed == 0
        retrieved = file_service.get(stored.file_id)
        assert retrieved.path.read_bytes() == b"fresh data"
