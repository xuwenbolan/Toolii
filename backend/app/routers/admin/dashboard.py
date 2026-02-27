from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.core.dependencies import get_admin_user, get_db
from app.models.user import User
from app.schemas.admin import DashboardStatsResponse
from app.services.admin_service import AdminService

router = APIRouter(prefix="/dashboard", tags=["admin-dashboard"])


@router.get("/stats", response_model=DashboardStatsResponse)
async def get_stats(
    admin: User = Depends(get_admin_user),  # noqa: ARG001
    db=Depends(get_db),
    days: int = Query(default=30, ge=1, le=365),
) -> DashboardStatsResponse:
    data = await AdminService(db).get_dashboard_stats(days=days)
    return DashboardStatsResponse(**data)
