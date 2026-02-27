from __future__ import annotations

from pydantic import BaseModel, EmailStr, ConfigDict, Field


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    name: str | None = None

    is_active: bool = True
    email_verified: bool = False


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class UpdateProfileRequest(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    email: EmailStr | None = None


class DeleteAccountRequest(BaseModel):
    password: str | None = None
