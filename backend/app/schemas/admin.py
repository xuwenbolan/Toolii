from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


# ── Dashboard ──────────────────────────────────────────────

class DailyTrend(BaseModel):
    date: str
    value: int


class ToolRanking(BaseModel):
    tool_name: str
    display_name: str
    count: int


class DashboardStatsResponse(BaseModel):
    total_users: int
    new_users_today: int
    active_users_7d: int

    total_revenue: int
    revenue_today: int

    total_tool_uses: int
    tool_uses_today: int
    tool_ranking: list[ToolRanking]

    user_trend: list[DailyTrend]
    tool_trend: list[DailyTrend]
    revenue_trend: list[DailyTrend]


# ── Users ──────────────────────────────────────────────────

class AdminUserItem(BaseModel):
    id: int
    email: str
    name: str | None
    balance: int
    is_active: bool
    email_verified: bool
    is_admin: bool
    created_at: datetime


class AdminUserListResponse(BaseModel):
    items: list[AdminUserItem]
    total: int
    limit: int
    offset: int


class AdminLoginHistoryItem(BaseModel):
    id: int
    ip: str | None
    user_agent: str | None
    created_at: datetime


class AdminProcessingHistoryItem(BaseModel):
    id: int
    tool_name: str
    status: str
    created_at: datetime


class AdminTransactionItem(BaseModel):
    id: int
    tx_type: str
    amount: int
    balance_before: int
    balance_after: int
    description: str | None
    created_at: datetime


class AdminUserDetailResponse(BaseModel):
    id: int
    email: str
    name: str | None
    balance: int
    is_active: bool
    email_verified: bool
    is_admin: bool
    created_at: datetime
    hub_quota_mb: int | None = None
    hub_max_files: int | None = None
    hub_max_retention_days: int | None = None
    recent_logins: list[AdminLoginHistoryItem]
    recent_transactions: list[AdminTransactionItem]
    recent_processing: list[AdminProcessingHistoryItem]


class UpdateUserStatusRequest(BaseModel):
    is_active: bool


class UpdateHubSettingsRequest(BaseModel):
    hub_quota_mb: int | None = None
    hub_max_files: int | None = None
    hub_max_retention_days: int | None = None


class AdjustCreditsRequest(BaseModel):
    amount: int = Field(ge=-100000, le=100000, description="Positive to add, negative to deduct")
    description: str = Field(max_length=255)


class AdjustCreditsResponse(BaseModel):
    balance_before: int
    balance_after: int
    transaction_id: int


# ── Cards ──────────────────────────────────────────────────

class CardGenerateRequest(BaseModel):
    count: int = Field(ge=1, le=500)
    credits: int = Field(ge=1, le=100000)
    card_type: str = Field(default="standard", max_length=50)
    prefix: str = Field(default="TOOL", max_length=10, pattern=r"^[A-Z0-9]+$")
    expires_days: int | None = Field(default=None, ge=1)


class CardGenerateResponse(BaseModel):
    codes: list[str]
    count: int


class AdminCardItem(BaseModel):
    id: int
    credits: int
    card_type: str
    status: str
    redeemed_by_user_id: int | None
    redeemed_by_email: str | None = None
    expires_at: datetime | None
    redeemed_at: datetime | None
    created_at: datetime


class AdminCardListResponse(BaseModel):
    items: list[AdminCardItem]
    total: int
    limit: int
    offset: int


class CardStatusCount(BaseModel):
    status: str
    count: int


class CardSummaryResponse(BaseModel):
    status_counts: list[CardStatusCount]
    total_credits_issued: int
    total_credits_redeemed: int


# ── Operations ─────────────────────────────────────────────

class ToolUsageItem(BaseModel):
    tool_name: str
    display_name: str
    date: str
    count: int
    success_count: int
    fail_count: int


class ToolUsageResponse(BaseModel):
    items: list[ToolUsageItem]


class GlobalTransactionItem(BaseModel):
    id: int
    user_id: int
    user_email: str | None = None
    tx_type: str
    amount: int
    balance_before: int
    balance_after: int
    description: str | None
    reference_id: str | None
    created_at: datetime


class GlobalTransactionListResponse(BaseModel):
    items: list[GlobalTransactionItem]
    total: int
    limit: int
    offset: int


class AdminShareLinkItem(BaseModel):
    id: int
    token: str
    from_user_id: int
    from_user_email: str | None = None
    to_user_id: int | None
    to_user_email: str | None = None
    amount: int
    status: str
    expires_at: datetime | None
    claimed_at: datetime | None
    created_at: datetime


class AdminShareLinkListResponse(BaseModel):
    items: list[AdminShareLinkItem]
    total: int
    limit: int
    offset: int


class RevenueItem(BaseModel):
    period: str
    total_credits: int
    transaction_count: int


class RevenueResponse(BaseModel):
    items: list[RevenueItem]
    total_credits: int
    total_transactions: int


# ── Storage ──────────────────────────────────────────────

class StorageDirStats(BaseModel):
    name: str
    file_count: int
    total_size_bytes: int


class ProcessingStats(BaseModel):
    total: int
    today: int


class StorageOverviewResponse(BaseModel):
    directories: list[StorageDirStats]
    processing: ProcessingStats


class AdminProcessingHistoryListItem(BaseModel):
    id: int
    user_id: int | None
    user_email: str | None
    tool_name: str
    display_name: str
    status: str
    ip: str | None
    user_agent: str | None
    input_file_id: str | None
    output_file_id: str | None
    created_at: datetime


class AdminProcessingHistoryListResponse(BaseModel):
    items: list[AdminProcessingHistoryListItem]
    total: int
    limit: int
    offset: int


class StorageCleanupRequest(BaseModel):
    target: str = Field(pattern=r"^(hub|result_shares|all)$")


class StorageCleanupResponse(BaseModel):
    hub_expired: int
    shares_expired: int


# ── Hub Files & Share Groups ──────────────────────────────

class AdminHubFileItem(BaseModel):
    id: int
    user_id: int | None
    user_email: str | None = None
    file_name: str
    size: int
    content_type: str
    source: str
    status: str
    expires_at: datetime
    created_at: datetime


class AdminHubFileListResponse(BaseModel):
    items: list[AdminHubFileItem]
    total: int
    limit: int
    offset: int


class AdminShareGroupItem(BaseModel):
    id: int
    user_id: int
    user_email: str | None = None
    token: str
    file_count: int
    total_size: int
    download_count: int
    has_extract_code: bool
    message: str | None
    status: str
    expires_at: datetime | None
    created_at: datetime


class AdminShareGroupListResponse(BaseModel):
    items: list[AdminShareGroupItem]
    total: int
    limit: int
    offset: int


class AdminResultShareItem(BaseModel):
    id: int
    token: str
    share_type: str
    locale: str
    user_id: int | None
    user_email: str | None
    expires_at: datetime
    created_at: datetime


class AdminResultShareListResponse(BaseModel):
    items: list[AdminResultShareItem]
    total: int
    limit: int
    offset: int


# ── File Browser ─────────────────────────────────────────

class AdminFileItem(BaseModel):
    file_id: str
    original_filename: str
    content_type: str
    size: int
    created_at: int
    previewable: bool


class AdminFileListResponse(BaseModel):
    items: list[AdminFileItem]
    total: int
    directory: str


class AdminFileDownloadResponse(BaseModel):
    download_url: str


# ── Audit Logs ───────────────────────────────────────────

class AuditLogItem(BaseModel):
    id: int
    user_id: int | None
    user_email: str | None = None
    category: str
    action: str
    success: bool
    resource_type: str | None
    resource_id: str | None
    ip: str | None
    user_agent: str | None
    detail: str | None
    created_at: datetime


class AuditLogListResponse(BaseModel):
    items: list[AuditLogItem]
    total: int
    limit: int
    offset: int
