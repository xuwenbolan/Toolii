from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from slowapi.util import get_remote_address

from app.core.audit_log import audit
from app.core.dependencies import get_admin_user, get_db
from app.core.rate_limiter import admin_write_rate_limit, limiter
from app.models.user import User
from app.schemas.admin import (
    AdminFileTransferListResponse,
    AdminResultShareListResponse,
)
from app.services.admin_service import AdminService

router = APIRouter(prefix="/transfers", tags=["admin-transfers"])


@router.get("/file-transfers", response_model=AdminFileTransferListResponse)
async def list_file_transfers(
    admin: User = Depends(get_admin_user),  # noqa: ARG001
    db=Depends(get_db),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None),
) -> AdminFileTransferListResponse:
    data = await AdminService(db).list_file_transfers(
        limit=limit, offset=offset, status=status,
    )
    return AdminFileTransferListResponse(**data)


@router.put("/file-transfers/{transfer_id}/expire")
@limiter.limit(admin_write_rate_limit)
async def force_expire_transfer(
    request: Request,
    transfer_id: int,
    admin: User = Depends(get_admin_user),
    db=Depends(get_db),
) -> dict:
    await AdminService(db).force_expire_transfer(transfer_id)
    await audit(
        category="admin",
        action="force_expire_transfer",
        user_id=admin.id,
        resource_type="transfer",
        resource_id=transfer_id,
        ip=get_remote_address(request),
    )
    return {"status": "ok"}


@router.delete("/file-transfers/{transfer_id}")
@limiter.limit(admin_write_rate_limit)
async def delete_transfer(
    request: Request,
    transfer_id: int,
    admin: User = Depends(get_admin_user),
    db=Depends(get_db),
) -> dict:
    await AdminService(db).delete_transfer(transfer_id)
    await audit(
        category="admin",
        action="delete_transfer",
        user_id=admin.id,
        resource_type="transfer",
        resource_id=transfer_id,
        ip=get_remote_address(request),
    )
    return {"status": "ok"}


@router.get("/result-shares", response_model=AdminResultShareListResponse)
async def list_result_shares(
    admin: User = Depends(get_admin_user),  # noqa: ARG001
    db=Depends(get_db),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    share_type: str | None = Query(default=None),
    expired: bool | None = Query(default=None),
) -> AdminResultShareListResponse:
    data = await AdminService(db).list_result_shares(
        limit=limit, offset=offset, share_type=share_type, expired=expired,
    )
    return AdminResultShareListResponse(**data)


@router.delete("/result-shares/{share_id}")
@limiter.limit(admin_write_rate_limit)
async def delete_result_share(
    request: Request,
    share_id: int,
    admin: User = Depends(get_admin_user),
    db=Depends(get_db),
) -> dict:
    await AdminService(db).delete_result_share(share_id)
    await audit(
        category="admin",
        action="delete_result_share",
        user_id=admin.id,
        resource_type="result_share",
        resource_id=share_id,
        ip=get_remote_address(request),
    )
    return {"status": "ok"}
