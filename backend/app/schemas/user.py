from __future__ import annotations

from pydantic import BaseModel, EmailStr, ConfigDict, Field


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    name: str | None = None

    is_active: bool = True
    email_verified: bool = False
    is_admin: bool = False
    has_password: bool = False


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class UpdateProfileRequest(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    email: EmailStr | None = None
    current_password: str | None = None  # Required when changing email


class DeleteAccountRequest(BaseModel):
    password: str | None = None
    confirm_email: str | None = None  # Required for Google-only accounts


class RecoverAccountRequest(BaseModel):
    email: EmailStr
    password: str | None = None
    confirm_email: str | None = None  # For Google-only accounts
