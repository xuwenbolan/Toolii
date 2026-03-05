from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path

from app.core.config import settings
from app.services.file_service import FileService

logger = logging.getLogger(__name__)

# Storage directories with human-readable keys
STORAGE_DIRS = {
    "files": lambda: settings.file_storage_dir,
    "transfers": lambda: settings.transfer_storage_dir,
    "result_shares": lambda: settings.result_share_storage_dir,
}

# Image content types that can be previewed in browser
_PREVIEWABLE_TYPES = frozenset({
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
    "application/pdf",
})


def _scan_files(
    dir_path: Path,
    offset: int,
    limit: int,
    search: str | None,
) -> tuple[list[dict], int]:
    """Scan a storage directory and return paginated file list with metadata."""
    all_files: list[dict] = []
    if not dir_path.exists():
        return [], 0

    for path in dir_path.rglob("*"):
        if not path.is_file() or path.suffix == ".json":
            continue

        file_id = path.name
        meta_path = path.with_suffix(".json")
        meta: dict = {}
        if meta_path.exists():
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                pass

        original_filename = str(meta.get("original_filename", file_id))
        content_type = str(meta.get("content_type", "application/octet-stream"))

        # Apply search filter
        if search:
            needle = search.lower()
            if needle not in file_id.lower() and needle not in original_filename.lower():
                continue

        try:
            stat = path.stat()
            size = int(meta.get("size", stat.st_size))
            created_at = int(meta.get("created_at", stat.st_mtime))
        except OSError:
            continue

        all_files.append({
            "file_id": file_id,
            "original_filename": original_filename,
            "content_type": content_type,
            "size": size,
            "created_at": created_at,
            "previewable": content_type in _PREVIEWABLE_TYPES,
        })

    # Sort by created_at descending (newest first)
    all_files.sort(key=lambda f: f["created_at"], reverse=True)

    total = len(all_files)
    return all_files[offset: offset + limit], total


class FileBrowserService:
    async def list_files(
        self,
        directory: str,
        *,
        offset: int = 0,
        limit: int = 50,
        search: str | None = None,
    ) -> dict:
        getter = STORAGE_DIRS.get(directory)
        if getter is None:
            return {"items": [], "total": 0, "directory": directory}

        dir_path = Path(getter())
        loop = asyncio.get_running_loop()
        items, total = await loop.run_in_executor(
            None, _scan_files, dir_path, offset, limit, search,
        )
        return {"items": items, "total": total, "directory": directory}

    def get_admin_download_url(self, directory: str, file_id: str) -> str:
        """Generate a signed download URL for admin file access."""
        getter = STORAGE_DIRS.get(directory)
        if getter is None:
            raise FileNotFoundError(f"Unknown directory: {directory}")

        fs = FileService(storage_dir=getter())
        stored = fs.get(file_id)
        return fs.build_download_url(
            file_id=file_id,
            filename=stored.original_filename,
            ttl_seconds=3600,
        )
