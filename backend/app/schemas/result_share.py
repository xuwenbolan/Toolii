from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class ResultShareCreateResponse(BaseModel):
    token: str
    share_url: str
    expires_at: datetime


class ResultShareDataResponse(BaseModel):
    token: str
    result_json: str
    share_type: str
    locale: str
    image_url: str
    original_image_url: str | None = None
    expires_at: datetime
    created_at: datetime
