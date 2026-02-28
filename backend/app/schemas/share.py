from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel
from pydantic import Field


class ShareCreateRequest(BaseModel):
    amount: int = Field(gt=0, le=1000)


class ShareLinkItem(BaseModel):
    id: int
    token: str
    amount: int
    status: str
    from_user_id: int
    to_user_id: int | None = None
    expires_at: datetime | None = None
    claimed_at: datetime | None = None
    canceled_at: datetime | None = None
    created_at: datetime


class ShareCreateResponse(BaseModel):
    link: ShareLinkItem
    share_path: str
    balance_after: int


class ShareInfoResponse(BaseModel):
    token: str
    amount: int
    status: str
    expires_at: datetime | None = None
    claimed_at: datetime | None = None
    canceled_at: datetime | None = None
    created_at: datetime
    can_claim: bool


class ShareClaimResponse(BaseModel):
    code: str = ""
    message: str
    amount: int
    balance: int


class ShareLinksResponse(BaseModel):
    items: list[ShareLinkItem]
    total: int


class ShareCancelResponse(BaseModel):
    code: str = ""
    message: str
    balance: int
