from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.core.dependencies import get_admin_user, get_db
from app.models.user import User
from app.schemas.admin import (
    AdminShareLinkListResponse,
    GlobalTransactionListResponse,
    RevenueResponse,
    ToolUsageResponse,
)
from app.services.admin_service import AdminService

router = APIRouter(prefix="/operations", tags=["admin-operations"])


@router.get("/tool-usage", response_model=ToolUsageResponse)
async def get_tool_usage(
    admin: User = Depends(get_admin_user),  # noqa: ARG001
    db=Depends(get_db),
    days: int = Query(default=30, ge=1, le=365),
    tool_name: str | None = Query(default=None),
) -> ToolUsageResponse:
    items = await AdminService(db).get_tool_usage(days=days, tool_name=tool_name)
    return ToolUsageResponse(items=items)


@router.get("/transactions", response_model=GlobalTransactionListResponse)
async def list_transactions(
    admin: User = Depends(get_admin_user),  # noqa: ARG001
    db=Depends(get_db),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    tx_type: str | None = Query(default=None),
) -> GlobalTransactionListResponse:
    data = await AdminService(db).list_transactions(
        limit=limit, offset=offset, tx_type=tx_type,
    )
    return GlobalTransactionListResponse(**data)


@router.get("/share-links", response_model=AdminShareLinkListResponse)
async def list_share_links(
    admin: User = Depends(get_admin_user),  # noqa: ARG001
    db=Depends(get_db),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None),
) -> AdminShareLinkListResponse:
    data = await AdminService(db).list_share_links(
        limit=limit, offset=offset, status=status,
    )
    return AdminShareLinkListResponse(**data)


@router.get("/revenue", response_model=RevenueResponse)
async def get_revenue(
    admin: User = Depends(get_admin_user),  # noqa: ARG001
    db=Depends(get_db),
    granularity: str = Query(default="day", pattern="^(day|week|month)$"),
    days: int = Query(default=30, ge=1, le=365),
) -> RevenueResponse:
    data = await AdminService(db).get_revenue(granularity=granularity, days=days)
    return RevenueResponse(**data)
