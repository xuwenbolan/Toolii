from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class HistoryItem(BaseModel):
    id: int
    tool_name: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class HistoryListResponse(BaseModel):
    items: list[HistoryItem]
    total: int
    limit: int
    offset: int
