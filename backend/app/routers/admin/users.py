from __future__ import annotations

from fastapi import APIRouter, Depends, Path, Query, Request
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit_log import audit
from app.core.dependencies import get_admin_user, get_db
from app.core.exceptions import AppError
from app.core.rate_limiter import admin_write_rate_limit, limiter
from app.models.user import User
from app.schemas.admin import (
    AdminUserDetailResponse,
    AdminUserListResponse,
    AdjustCreditsRequest,
    AdjustCreditsResponse,
    UpdateHubSettingsRequest,
    UpdateUserStatusRequest,
)
from app.schemas.common import Message
from app.services.admin_service import AdminService

router = APIRouter(prefix="/users", tags=["admin-users"])


@router.get("", response_model=AdminUserListResponse)
async def list_users(
    admin: User = Depends(get_admin_user),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
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
    db: AsyncSession = Depends(get_db),
) -> AdminUserDetailResponse:
    data = await AdminService(db).get_user_detail(user_id)
    return AdminUserDetailResponse(**data)


@router.put("/{user_id}/status", response_model=Message)
@limiter.limit(admin_write_rate_limit)
async def update_user_status(
    request: Request,
    payload: UpdateUserStatusRequest,
    user_id: int = Path(),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> Message:
    await AdminService(db).toggle_user_status(user_id, is_active=payload.is_active)
    status = "enabled" if payload.is_active else "disabled"
    await audit(
        category="admin",
        action="toggle_user_status",
        user_id=admin.id,
        resource_type="user",
        resource_id=user_id,
        ip=get_remote_address(request),
        detail={"is_active": payload.is_active},
    )
    return Message(message=f"User {status}")


@router.post("/{user_id}/credits", response_model=AdjustCreditsResponse)
@limiter.limit(admin_write_rate_limit)
async def adjust_credits(
    request: Request,
    payload: AdjustCreditsRequest,
    user_id: int = Path(),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> AdjustCreditsResponse:
    if user_id == admin.id:
        raise AppError(code="SELF_OPERATION_FORBIDDEN", message="Cannot adjust own credits", status_code=403)
    data = await AdminService(db).adjust_credits(
        user_id, amount=payload.amount, description=payload.description,
    )
    await audit(
        category="admin",
        action="adjust_credits",
        user_id=admin.id,
        resource_type="user",
        resource_id=user_id,
        ip=get_remote_address(request),
        detail={
            "amount": payload.amount,
            "description": payload.description,
            "balance_before": data["balance_before"],
            "balance_after": data["balance_after"],
        },
    )
    return AdjustCreditsResponse(**data)


@router.put("/{user_id}/hub-settings", response_model=Message)
@limiter.limit(admin_write_rate_limit)
async def update_hub_settings(
    request: Request,
    payload: UpdateHubSettingsRequest,
    user_id: int = Path(),
    admin: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> Message:
    await AdminService(db).update_hub_settings(
        user_id,
        hub_quota_mb=payload.hub_quota_mb,
        hub_max_files=payload.hub_max_files,
        hub_max_retention_days=payload.hub_max_retention_days,
    )
    await audit(
        category="admin",
        action="update_hub_settings",
        user_id=admin.id,
        resource_type="user",
        resource_id=user_id,
        ip=get_remote_address(request),
        detail={
            "hub_quota_mb": payload.hub_quota_mb,
            "hub_max_files": payload.hub_max_files,
            "hub_max_retention_days": payload.hub_max_retention_days,
        },
    )
    return Message(message="Hub settings updated")
