from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from slowapi.util import get_remote_address

from app.core.audit_log import audit
from app.core.dependencies import get_admin_user, get_db
from app.models.user import User
from app.schemas.admin import (
    StorageCleanupRequest,
    StorageCleanupResponse,
    StorageOverviewResponse,
)
from app.services.storage_admin_service import StorageAdminService

router = APIRouter(prefix="/storage", tags=["admin-storage"])


@router.get("/overview", response_model=StorageOverviewResponse)
async def get_storage_overview(
    admin: User = Depends(get_admin_user),  # noqa: ARG001
    db=Depends(get_db),
) -> StorageOverviewResponse:
    data = await StorageAdminService(db).get_overview()
    return StorageOverviewResponse(**data)


@router.post("/cleanup", response_model=StorageCleanupResponse)
async def run_cleanup(
    request: Request,
    body: StorageCleanupRequest,
    admin: User = Depends(get_admin_user),
    db=Depends(get_db),
) -> StorageCleanupResponse:
    data = await StorageAdminService(db).run_cleanup(body.target)
    await audit(
        category="admin",
        action="storage_cleanup",
        user_id=admin.id,
        ip=get_remote_address(request),
        detail={"target": body.target, **data},
    )
    return StorageCleanupResponse(**data)
