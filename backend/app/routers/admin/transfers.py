from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit_log import audit
from app.core.dependencies import get_admin_user, get_db
from app.core.rate_limiter import admin_write_rate_limit, limiter
from app.models.user import User
from app.schemas.admin import (
    AdminHubFileListResponse,
    AdminResultShareListResponse,
    AdminShareGroupListResponse,
)
from app.schemas.common import Message
from app.services.admin_transfer_service import AdminTransferService

router = APIRouter(prefix="/transfers", tags=["admin-transfers"])


@router.get("/hub-files", response_model=AdminHubFileListResponse)
async def list_hub_files(
    admin: User = Depends(get_admin_user),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    source: str | None = Query(default=None),
) -> AdminHubFileListResponse:
    data = await AdminTransferService(db).list_hub_files(
        limit=limit, offset=offset, source=source,
    )
    return AdminHubFileListResponse(**data)


@router.delete("/hub-files/{file_id}", response_model=Message)
@limiter.limit(admin_write_rate_limit)
async def delete_hub_file(
    request: Request,
    file_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> Message:
    await AdminTransferService(db).delete_hub_file(file_id)
    await audit(
        category="admin",
        action="delete_hub_file",
        user_id=admin.id,
        resource_type="hub_file",
        resource_id=file_id,
        ip=get_remote_address(request),
    )
    return Message(message="Hub file deleted")


@router.get("/share-groups", response_model=AdminShareGroupListResponse)
async def list_share_groups(
    admin: User = Depends(get_admin_user),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None),
) -> AdminShareGroupListResponse:
    data = await AdminTransferService(db).list_share_groups(
        limit=limit, offset=offset, status=status,
    )
    return AdminShareGroupListResponse(**data)


@router.delete("/share-groups/{group_id}", response_model=Message)
@limiter.limit(admin_write_rate_limit)
async def delete_share_group(
    request: Request,
    group_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> Message:
    await AdminTransferService(db).delete_share_group(group_id)
    await audit(
        category="admin",
        action="delete_share_group",
        user_id=admin.id,
        resource_type="share_group",
        resource_id=group_id,
        ip=get_remote_address(request),
    )
    return Message(message="Share group deleted")


@router.get("/result-shares", response_model=AdminResultShareListResponse)
async def list_result_shares(
    admin: User = Depends(get_admin_user),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    share_type: str | None = Query(default=None),
    expired: bool | None = Query(default=None),
) -> AdminResultShareListResponse:
    data = await AdminTransferService(db).list_result_shares(
        limit=limit, offset=offset, share_type=share_type, expired=expired,
    )
    return AdminResultShareListResponse(**data)


@router.delete("/result-shares/{share_id}", response_model=Message)
@limiter.limit(admin_write_rate_limit)
async def delete_result_share(
    request: Request,
    share_id: int,
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> Message:
    await AdminTransferService(db).delete_result_share(share_id)
    await audit(
        category="admin",
        action="delete_result_share",
        user_id=admin.id,
        resource_type="result_share",
        resource_id=share_id,
        ip=get_remote_address(request),
    )
    return Message(message="Result share deleted")
