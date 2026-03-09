"""Admin tools management API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Path, Request
from slowapi.util import get_remote_address

from app.core.audit_log import audit
from app.core.dependencies import get_admin_user
from app.core.rate_limiter import admin_write_rate_limit, limiter
from app.models.user import User
from app.schemas.tool import AdminToolItem, AdminToolListResponse, AdminToolUpdateRequest
from app.services import tool_service

router = APIRouter(prefix="/tools", tags=["admin-tools"])


@router.get("", response_model=AdminToolListResponse)
async def list_tools(
    _admin: User = Depends(get_admin_user),
) -> AdminToolListResponse:
    """List all tools with full admin fields."""
    tools = await tool_service.list_tools()
    items = [
        AdminToolItem(
            tool_name=t.tool_name,
            category=t.category,
            display_order=t.display_order,
            is_enabled=t.is_enabled,
            credit_cost=t.credit_cost,
            display_name_zh=t.display_name_zh,
            display_name_en=t.display_name_en,
            description_zh=t.description_zh,
            description_en=t.description_en,
            icon=t.icon,
            access_level=t.access_level,
            daily_limit_anon=t.daily_limit_anon,
            daily_limit_auth=t.daily_limit_auth,
            created_at=t.created_at,
            updated_at=t.updated_at,
        )
        for t in tools
    ]
    return AdminToolListResponse(tools=items)


@router.put("/{tool_name}", response_model=AdminToolItem)
@limiter.limit(admin_write_rate_limit)
async def update_tool(
    request: Request,
    body: AdminToolUpdateRequest,
    tool_name: str = Path(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_-]*$"),
    admin: User = Depends(get_admin_user),
) -> AdminToolItem:
    """Update a tool's configuration. Only provided fields are updated."""
    fields = body.model_dump(exclude_unset=True)
    tool = await tool_service.update_tool(tool_name, **fields)
    await audit(
        category="admin",
        action="update_tool",
        user_id=admin.id,
        resource_type="tool",
        resource_id=tool_name,
        ip=get_remote_address(request),
        detail=fields,
    )
    return AdminToolItem(
        tool_name=tool.tool_name,
        category=tool.category,
        display_order=tool.display_order,
        is_enabled=tool.is_enabled,
        credit_cost=tool.credit_cost,
        display_name_zh=tool.display_name_zh,
        display_name_en=tool.display_name_en,
        description_zh=tool.description_zh,
        description_en=tool.description_en,
        icon=tool.icon,
        access_level=tool.access_level,
        daily_limit_anon=tool.daily_limit_anon,
        daily_limit_auth=tool.daily_limit_auth,
        created_at=tool.created_at,
        updated_at=tool.updated_at,
    )
