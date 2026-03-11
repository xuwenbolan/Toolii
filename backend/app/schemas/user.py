from __future__ import annotations

from pydantic import BaseModel, EmailStr, ConfigDict, Field

from app.schemas.validators import StrongPassword


class UserPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    name: str | None = None

    is_active: bool = True
    email_verified: bool = False
    is_admin: bool = False
    has_password: bool = False

    @classmethod
    def from_user(cls, user: object) -> "UserPublic":
        """Build UserPublic from a User ORM model, setting has_password correctly."""
        pub = cls.model_validate(user)
        pub.has_password = getattr(user, "hashed_password", None) is not None
        return pub


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(max_length=128)
    new_password: StrongPassword


class UpdateProfileRequest(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    email: EmailStr | None = None
    current_password: str | None = Field(default=None, max_length=128)


class DeleteAccountRequest(BaseModel):
    password: str | None = Field(default=None, max_length=128)
    confirm_email: str | None = None  # Required for Google-only accounts


class RecoverAccountRequest(BaseModel):
    email: EmailStr
    password: str | None = Field(default=None, max_length=128)
    confirm_email: str | None = None  # For Google-only accounts
