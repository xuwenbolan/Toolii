from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.core.dependencies import get_admin_user, get_db
from app.models.user import User
from app.schemas.admin import (
    AdminProcessingHistoryListResponse,
    StorageCleanupRequest,
    StorageCleanupResponse,
    StorageOverviewResponse,
)
from app.services.admin_service import AdminService
from app.services.storage_admin_service import StorageAdminService

router = APIRouter(prefix="/storage", tags=["admin-storage"])


@router.get("/overview", response_model=StorageOverviewResponse)
async def get_storage_overview(
    admin: User = Depends(get_admin_user),  # noqa: ARG001
    db=Depends(get_db),
) -> StorageOverviewResponse:
    data = await StorageAdminService(db).get_overview()
    return StorageOverviewResponse(**data)


@router.get("/processing-history", response_model=AdminProcessingHistoryListResponse)
async def list_processing_history(
    admin: User = Depends(get_admin_user),  # noqa: ARG001
    db=Depends(get_db),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    tool_name: str | None = Query(default=None),
    status: str | None = Query(default=None),
) -> AdminProcessingHistoryListResponse:
    data = await AdminService(db).list_processing_history(
        limit=limit, offset=offset, tool_name=tool_name, status=status,
    )
    return AdminProcessingHistoryListResponse(**data)


@router.post("/cleanup", response_model=StorageCleanupResponse)
async def run_cleanup(
    body: StorageCleanupRequest,
    admin: User = Depends(get_admin_user),  # noqa: ARG001
    db=Depends(get_db),
) -> StorageCleanupResponse:
    data = await StorageAdminService(db).run_cleanup(body.target)
    return StorageCleanupResponse(**data)
