"""Public tools API -- returns tool configuration for the frontend."""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.core.config import settings
from app.schemas.tool import ToolItem, ToolListResponse
from app.services import tool_service

router = APIRouter(prefix=f"{settings.api_prefix}/tools", tags=["tools"])


def _pick_locale(accept_lang: str | None) -> str:
    if not accept_lang:
        return "zh"
    lang = accept_lang.split(",")[0].strip().lower()
    return "en" if lang.startswith("en") else "zh"


@router.get("", response_model=ToolListResponse)
async def list_tools(request: Request) -> ToolListResponse:
    """List all tools with their configuration. Public endpoint."""
    tools = await tool_service.list_tools()
    locale = _pick_locale(request.headers.get("Accept-Language"))

    items = []
    for t in tools:
        display_name = t.display_name_en if locale == "en" else t.display_name_zh
        description = t.description_en if locale == "en" else t.description_zh

        items.append(ToolItem(
            tool_name=t.tool_name,
            category=t.category,
            is_enabled=t.is_enabled,
            credit_cost=t.credit_cost,
            display_order=t.display_order,
            display_name=display_name,
            description=description,
            icon=t.icon,
            access_level=t.access_level,
            daily_limit=t.daily_limit_auth if t.daily_limit_auth is not None else t.daily_limit_anon,
        ))

    return ToolListResponse(tools=items)
