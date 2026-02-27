from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, EmailStr, Field

from app.schemas.user import UserPublic


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str | None = Field(default=None, max_length=100)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class GoogleAuthRequest(BaseModel):
    access_token: str
    link_password: str | None = None


class AccessTokenResponse(BaseModel):
    token_type: Literal["bearer"] = "bearer"
    access_token: str
    expires_in: int


class AuthResponse(BaseModel):
    user: UserPublic
    tokens: AccessTokenResponse


class VerifyEmailRequest(BaseModel):
    token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=128)
