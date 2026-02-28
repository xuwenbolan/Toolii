from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class TransferFileItem(BaseModel):
    id: int
    original_filename: str
    size: int
    content_type: str


class TransferCreateResponse(BaseModel):
    token: str
    transfer_path: str
    expires_at: datetime
    file_count: int
    total_size: int
    burn_after_read: bool = False
    extract_code: str | None = None


class TransferInfoResponse(BaseModel):
    token: str
    message: str | None = None
    expires_at: datetime
    file_count: int
    total_size: int
    has_extract_code: bool
    download_count: int
    max_downloads: int | None = None
    burn_after_read: bool = False
    status: str
    files: list[TransferFileItem]
    created_at: datetime


class TransferMyItem(BaseModel):
    id: int
    token: str
    file_count: int
    total_size: int
    status: str
    download_count: int
    max_downloads: int | None = None
    burn_after_read: bool = False
    expires_at: datetime
    created_at: datetime


class TransferListResponse(BaseModel):
    items: list[TransferMyItem]
    total: int
