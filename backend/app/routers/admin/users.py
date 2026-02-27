from __future__ import annotations

from fastapi import APIRouter, Depends, Path, Query

from app.core.dependencies import get_admin_user, get_db
from app.models.user import User
from app.schemas.admin import (
    AdminUserDetailResponse,
    AdminUserListResponse,
    AdjustCreditsRequest,
    AdjustCreditsResponse,
    UpdateUserStatusRequest,
)
from app.schemas.common import Message
from app.services.admin_service import AdminService

router = APIRouter(prefix="/users", tags=["admin-users"])


@router.get("", response_model=AdminUserListResponse)
async def list_users(
    admin: User = Depends(get_admin_user),  # noqa: ARG001
    db=Depends(get_db),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    search: str | None = Query(default=None),
    is_active: bool | None = Query(default=None),
) -> AdminUserListResponse:
    data = await AdminService(db).list_users(
        limit=limit, offset=offset, search=search, is_active=is_active,
    )
    return AdminUserListResponse(**data)


@router.get("/{user_id}", response_model=AdminUserDetailResponse)
async def get_user_detail(
    user_id: int = Path(),
    admin: User = Depends(get_admin_user),  # noqa: ARG001
    db=Depends(get_db),
) -> AdminUserDetailResponse:
    data = await AdminService(db).get_user_detail(user_id)
    return AdminUserDetailResponse(**data)


@router.put("/{user_id}/status", response_model=Message)
async def update_user_status(
    payload: UpdateUserStatusRequest,
    user_id: int = Path(),
    admin: User = Depends(get_admin_user),  # noqa: ARG001
    db=Depends(get_db),
) -> Message:
    await AdminService(db).toggle_user_status(user_id, is_active=payload.is_active)
    status = "enabled" if payload.is_active else "disabled"
    return Message(message=f"User {status}")


@router.post("/{user_id}/credits", response_model=AdjustCreditsResponse)
async def adjust_credits(
    payload: AdjustCreditsRequest,
    user_id: int = Path(),
    admin: User = Depends(get_admin_user),  # noqa: ARG001
    db=Depends(get_db),
) -> AdjustCreditsResponse:
    data = await AdminService(db).adjust_credits(
        user_id, amount=payload.amount, description=payload.description,
    )
    return AdjustCreditsResponse(**data)
