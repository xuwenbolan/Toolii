from __future__ import annotations

from pydantic import BaseModel


class UserFileItem(BaseModel):
    id: int
    file_name: str
    size: int
    content_type: str
    source: str
    expires_at: str | None
    created_at: str
    share_count: int = 0


class UserFileListResponse(BaseModel):
    items: list[UserFileItem]
    total: int
    used_bytes: int
    quota_bytes: int


class FileUploadResponse(BaseModel):
    files: list[UserFileItem]


class FileRenameRequest(BaseModel):
    file_name: str


class FileRenameResponse(BaseModel):
    id: int
    file_name: str


class FileExtendRequest(BaseModel):
    days: int


class FileExtendResponse(BaseModel):
    id: int
    expires_at: str | None


class FileDeleteRequest(BaseModel):
    ids: list[int]


class FileDeleteResponse(BaseModel):
    deleted: int


class ShareGroupCreate(BaseModel):
    file_ids: list[int]
    use_extract_code: bool = False
    message: str | None = None


class ShareGroupResponse(BaseModel):
    id: int
    token: str
    share_url: str
    extract_code: str | None = None
    message: str | None = None
    file_count: int
    total_size: int
    expires_at: str | None
    created_at: str


class ShareGroupListItem(BaseModel):
    id: int
    token: str
    extract_code: str | None = None
    message: str | None = None
    file_count: int
    total_size: int
    download_count: int
    expires_at: str | None
    created_at: str
    status: str


class ShareGroupListResponse(BaseModel):
    items: list[ShareGroupListItem]
    total: int


class QuickShareResponse(BaseModel):
    files: list[UserFileItem]
    share: ShareGroupResponse


class ShareFileItem(BaseModel):
    id: int
    file_name: str
    size: int
    content_type: str


class ShareInfoResponse(BaseModel):
    token: str
    message: str | None = None
    file_count: int
    total_size: int
    download_count: int
    expires_at: str | None
    has_extract_code: bool
    status: str
    created_at: str
    files: list[ShareFileItem]


class ShareNeedCodeResponse(BaseModel):
    has_extract_code: bool = True
    need_code: bool = True
