from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from app.schemas.user import UserPublic
from app.schemas.validators import StrongPassword


class RegisterRequest(BaseModel):
    email: EmailStr
    password: StrongPassword
    name: str | None = Field(default=None, max_length=100)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)


class GoogleAuthRequest(BaseModel):
    access_token: str = Field(max_length=4096)
    link_password: str | None = Field(default=None, max_length=128)


class AccessTokenResponse(BaseModel):
    token_type: Literal["bearer"] = "bearer"
    access_token: str
    expires_in: int


class AuthResponse(BaseModel):
    user: UserPublic
    tokens: AccessTokenResponse


class VerifyEmailRequest(BaseModel):
    token: str = Field(max_length=4096)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(max_length=4096)
    password: StrongPassword
