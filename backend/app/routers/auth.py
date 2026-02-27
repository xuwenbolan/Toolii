from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.core.config import settings
from app.core.dependencies import get_current_user, get_db
from app.core.rate_limiter import limiter
from app.models.user import User
from app.schemas.auth import AuthResponse, GoogleAuthRequest, LoginRequest, RefreshRequest, RegisterRequest, TokenPair
from app.schemas.user import UserPublic
from app.services.auth_service import AuthService

router = APIRouter(prefix=f"{settings.api_prefix}/auth", tags=["auth"])


def _to_user_public(user: User) -> UserPublic:
    return UserPublic.model_validate(user)


def _to_auth_response(user: User) -> AuthResponse:
    access_token, refresh_token, expires_in = AuthService.issue_tokens(user_id=user.id)
    return AuthResponse(
        user=_to_user_public(user),
        tokens=TokenPair(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=expires_in,
        ),
    )


@router.post("/register", response_model=AuthResponse)
@limiter.limit(settings.rate_limit_anon)
async def register(
    request: Request,  # noqa: ARG001
    payload: RegisterRequest,
    db=Depends(get_db),
) -> AuthResponse:
    user = await AuthService(db).register(email=payload.email, password=payload.password)
    return _to_auth_response(user)


@router.post("/login", response_model=AuthResponse)
@limiter.limit(settings.rate_limit_anon)
async def login(
    request: Request,  # noqa: ARG001
    payload: LoginRequest,
    db=Depends(get_db),
) -> AuthResponse:
    user = await AuthService(db).login(email=payload.email, password=payload.password)
    return _to_auth_response(user)


@router.post("/google", response_model=AuthResponse)
@limiter.limit(settings.rate_limit_anon)
async def google_auth(
    request: Request,  # noqa: ARG001
    payload: GoogleAuthRequest,
    db=Depends(get_db),
) -> AuthResponse:
    user = await AuthService(db).google_auth(credential=payload.credential)
    return _to_auth_response(user)


@router.post("/refresh", response_model=TokenPair)
@limiter.limit(settings.rate_limit_anon)
async def refresh(
    request: Request,  # noqa: ARG001
    payload: RefreshRequest,
    db=Depends(get_db),
) -> TokenPair:
    user = await AuthService(db).refresh(refresh_token=payload.refresh_token)
    access_token, refresh_token, expires_in = AuthService.issue_tokens(user_id=user.id)
    return TokenPair(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=expires_in,
    )


@router.get("/me", response_model=UserPublic)
@limiter.limit(settings.rate_limit_auth)
async def me(request: Request, user: User = Depends(get_current_user)) -> UserPublic:  # noqa: ARG001
    return _to_user_public(user)
