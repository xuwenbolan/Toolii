from __future__ import annotations

from pydantic import AliasChoices, BaseModel, Field


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
    quota_bytes: int  # 0 = unlimited
    file_count: int
    max_files: int  # 0 = unlimited
    max_retention_days: int  # 0 = unlimited


class UserFileDetailResponse(BaseModel):
    id: int
    file_name: str
    size: int
    content_type: str
    source: str
    expires_at: str | None
    created_at: str
    updated_at: str


class FileUploadResponse(BaseModel):
    files: list[UserFileItem]


class FileRenameRequest(BaseModel):
    file_name: str = Field(min_length=1, max_length=255)


class FileRenameResponse(BaseModel):
    id: int
    file_name: str


class FileExtendRequest(BaseModel):
    days: int = Field(ge=1, le=365)


class FileExtendResponse(BaseModel):
    id: int
    expires_at: str | None


class FileDeleteRequest(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=50)


class FileDeleteResponse(BaseModel):
    deleted: int


class FileContentResponse(BaseModel):
    content: str
    updated_at: str | None = None


class FileContentUpdateRequest(BaseModel):
    content: str = Field(max_length=1_048_576)
    base_updated_at: str = Field(
        validation_alias=AliasChoices("base_updated_at", "expected_updated_at")
    )


class FileContentUpdateResponse(BaseModel):
    size: int
    updated_at: str


class EditorImageUploadResponse(BaseModel):
    file_id: str
    url: str


class ShareGroupCreate(BaseModel):
    file_ids: list[int] = Field(min_length=1)
    use_extract_code: bool = False
    message: str | None = Field(None, max_length=500)


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
