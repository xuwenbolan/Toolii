from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from app.core.config import settings
from app.services.file_service import build_download_url

logger = logging.getLogger(__name__)

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
    """Scan hub storage directory and return paginated file list."""
    all_files: list[dict] = []
    if not dir_path.exists():
        return [], 0

    for path in dir_path.rglob("*"):
        if not path.is_file():
            continue

        file_id = path.name

        if search:
            needle = search.lower()
            if needle not in file_id.lower():
                continue

        try:
            stat = path.stat()
        except OSError:
            continue

        all_files.append({
            "file_id": file_id,
            "original_filename": file_id,
            "content_type": "application/octet-stream",
            "size": stat.st_size,
            "created_at": int(stat.st_mtime),
            "previewable": False,
        })

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
        if directory != "hub":
            return {"items": [], "total": 0, "directory": directory}

        dir_path = Path(settings.hub_storage_dir)
        loop = asyncio.get_running_loop()
        items, total = await loop.run_in_executor(
            None, _scan_files, dir_path, offset, limit, search,
        )
        return {"items": items, "total": total, "directory": directory}

    def get_admin_download_url(self, directory: str, file_id: str) -> str:
        """Generate a signed download URL for admin file access."""
        if directory != "hub":
            raise FileNotFoundError(f"Unknown directory: {directory}")

        path = Path(settings.hub_storage_dir) / file_id[:2] / file_id[2:4] / file_id
        if not path.exists():
            raise FileNotFoundError(f"File not found: {file_id}")

        return build_download_url(file_id=file_id, filename=file_id, ttl_seconds=3600)
