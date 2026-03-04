from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.core.dependencies import get_admin_user, get_db
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
async def force_expire_transfer(
    transfer_id: int,
    admin: User = Depends(get_admin_user),  # noqa: ARG001
    db=Depends(get_db),
) -> dict:
    await AdminService(db).force_expire_transfer(transfer_id)
    return {"status": "ok"}


@router.delete("/file-transfers/{transfer_id}")
async def delete_transfer(
    transfer_id: int,
    admin: User = Depends(get_admin_user),  # noqa: ARG001
    db=Depends(get_db),
) -> dict:
    await AdminService(db).delete_transfer(transfer_id)
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
async def delete_result_share(
    share_id: int,
    admin: User = Depends(get_admin_user),  # noqa: ARG001
    db=Depends(get_db),
) -> dict:
    await AdminService(db).delete_result_share(share_id)
    return {"status": "ok"}
