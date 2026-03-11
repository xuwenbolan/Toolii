from __future__ import annotations

from fastapi import APIRouter, Depends, Path, Query, Request
from slowapi.util import get_remote_address

from app.core.audit_log import audit
from app.core.dependencies import get_admin_user
from app.core.exceptions import NotFoundError
from app.models.user import User
from app.schemas.admin import (
    AdminFileDownloadResponse,
    AdminFileListResponse,
)
from app.services.file_browser_service import FileBrowserService

router = APIRouter(prefix="/files", tags=["admin-files"])


@router.get("", response_model=AdminFileListResponse)
async def list_files(
    directory: str = Query(pattern=r"^(hub)$"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    search: str | None = Query(default=None, max_length=100),
    admin: User = Depends(get_admin_user),  # noqa: ARG001
) -> AdminFileListResponse:
    data = await FileBrowserService().list_files(
        directory, offset=offset, limit=limit, search=search,
    )
    return AdminFileListResponse(**data)


@router.get("/{file_id}/download", response_model=AdminFileDownloadResponse)
async def get_download_url(
    request: Request,
    file_id: str = Path(pattern=r"^[a-f0-9]{32}$"),
    directory: str = Query(pattern=r"^(hub)$"),
    admin: User = Depends(get_admin_user),
) -> AdminFileDownloadResponse:
    try:
        url = await FileBrowserService().get_admin_download_url(directory, file_id)
    except FileNotFoundError as exc:
        raise NotFoundError("File not found") from exc
    await audit(
        category="admin",
        action="file_download",
        user_id=admin.id,
        ip=get_remote_address(request),
        resource_type="file",
        resource_id=file_id,
        detail={"directory": directory},
    )
    return AdminFileDownloadResponse(download_url=url)
