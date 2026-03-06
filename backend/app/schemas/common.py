from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class Message(BaseModel):
    message: str


class FileResult(BaseModel):
    file_id: str
    filename: str
    size: int
    content_type: str
    download_url: str
    preview_url: str | None = None
    requires_credit: bool = False
    credit_cost: int = 0
    expires_in: int
    # Internal metadata for hub storage (not serialized to API response)
    meta: dict[str, Any] | None = None

