from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class FeedbackCategory(str, Enum):
    feature_request = "feature_request"
    bug_report = "bug_report"
    suggestion = "suggestion"
    other = "other"


class FeedbackStatus(str, Enum):
    pending = "pending"
    reviewed = "reviewed"
    resolved = "resolved"


# ── User-facing ────────────────────────────────────────────

class FeedbackCreateRequest(BaseModel):
    category: FeedbackCategory
    content: str = Field(min_length=1, max_length=1000)


class FeedbackItem(BaseModel):
    id: int
    category: str
    content: str
    status: str
    admin_note: str | None = None
    created_at: datetime


class FeedbackListResponse(BaseModel):
    items: list[FeedbackItem]
    total: int


# ── Admin-facing ───────────────────────────────────────────

class AdminFeedbackItem(BaseModel):
    id: int
    user_id: int
    user_email: str
    user_name: str | None = None
    category: str
    content: str
    status: str
    admin_note: str | None = None
    created_at: datetime


class AdminFeedbackListResponse(BaseModel):
    items: list[AdminFeedbackItem]
    total: int


class AdminUpdateFeedbackRequest(BaseModel):
    status: FeedbackStatus | None = None
    admin_note: str | None = Field(default=None, max_length=1000)
