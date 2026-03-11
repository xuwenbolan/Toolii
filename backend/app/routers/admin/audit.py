from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_admin_user, get_db
from app.models.user import User
from app.schemas.admin import AuditLogListResponse
from app.services.admin_ops_service import AdminOpsService

router = APIRouter(prefix="/audit", tags=["admin-audit"])


@router.get("/logs", response_model=AuditLogListResponse)
async def list_audit_logs(
    admin: User = Depends(get_admin_user),  # noqa: ARG001
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    category: str | None = Query(default=None),
    action: str | None = Query(default=None),
    user_id: int | None = Query(default=None),
    success: bool | None = Query(default=None),
) -> AuditLogListResponse:
    data = await AdminOpsService(db).list_audit_logs(
        limit=limit,
        offset=offset,
        category=category,
        action=action,
        user_id=user_id,
        success=success,
    )
    return AuditLogListResponse(**data)
