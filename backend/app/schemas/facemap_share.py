from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class FaceMapShareCreateResponse(BaseModel):
    token: str
    share_url: str
    expires_at: datetime


class FaceMapShareDataResponse(BaseModel):
    token: str
    result_json: str
    share_type: str
    locale: str
    image_url: str
    expires_at: datetime
    created_at: datetime
