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
    credential: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    token_type: Literal["bearer"] = "bearer"
    access_token: str
    refresh_token: str
    expires_in: int


class AuthResponse(BaseModel):
    user: UserPublic
    tokens: TokenPair
