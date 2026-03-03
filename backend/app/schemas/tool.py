"""Pydantic schemas for tool management."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class ToolItem(BaseModel):
    """Public tool info returned by GET /api/v1/tools."""

    tool_name: str
    category: str
    is_enabled: bool
    credit_cost: int
    display_order: int
    display_name: str | None = None
    description: str | None = None
    icon: str | None = None
    access_level: str
    daily_limit: int | None = None


class ToolListResponse(BaseModel):
    tools: list[ToolItem]


class AdminToolItem(BaseModel):
    """Full tool info for admin panel."""

    tool_name: str
    category: str
    display_order: int
    is_enabled: bool
    credit_cost: int
    display_name_zh: str | None = None
    display_name_en: str | None = None
    description_zh: str | None = None
    description_en: str | None = None
    icon: str | None = None
    access_level: str
    daily_limit_anon: int | None = None
    daily_limit_auth: int | None = None
    created_at: datetime
    updated_at: datetime


class AdminToolListResponse(BaseModel):
    tools: list[AdminToolItem]


class AdminToolUpdateRequest(BaseModel):
    """Partial update request for a tool."""

    is_enabled: bool | None = None
    credit_cost: int | None = Field(None, ge=0)
    display_order: int | None = None
    display_name_zh: str | None = None
    display_name_en: str | None = None
    description_zh: str | None = None
    description_en: str | None = None
    icon: str | None = None
    access_level: str | None = None
    daily_limit_anon: int | None = Field(None, ge=0)
    daily_limit_auth: int | None = Field(None, ge=0)
