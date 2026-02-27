from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from slowapi.util import get_remote_address

from app.core.audit_log import log_auth_event
from app.core.config import settings
from app.core.dependencies import get_current_user, get_db
from app.core.rate_limiter import limiter
from app.core.security import decode_jwt_token
from app.core.token_blacklist import token_blacklist
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
    request: Request,
    payload: RegisterRequest,
    db=Depends(get_db),
) -> AuthResponse:
    ip = get_remote_address(request)
    try:
        user = await AuthService(db).register(email=payload.email, password=payload.password, name=payload.name)
    except Exception:
        log_auth_event("register_failed", email=payload.email, ip=ip, success=False)
        raise
    log_auth_event("register_success", email=payload.email, user_id=user.id, ip=ip)
    return _to_auth_response(user)


@router.post("/login", response_model=AuthResponse)
@limiter.limit(settings.rate_limit_anon)
async def login(
    request: Request,
    payload: LoginRequest,
    db=Depends(get_db),
) -> AuthResponse:
    ip = get_remote_address(request)
    try:
        user = await AuthService(db).login(email=payload.email, password=payload.password)
    except Exception:
        log_auth_event("login_failed", email=payload.email, ip=ip, success=False)
        raise
    log_auth_event("login_success", email=payload.email, user_id=user.id, ip=ip)
    return _to_auth_response(user)


@router.post("/google", response_model=AuthResponse)
@limiter.limit(settings.rate_limit_anon)
async def google_auth(
    request: Request,
    payload: GoogleAuthRequest,
    db=Depends(get_db),
) -> AuthResponse:
    ip = get_remote_address(request)
    try:
        user = await AuthService(db).google_auth(credential=payload.credential)
    except Exception:
        log_auth_event("google_auth_failed", ip=ip, success=False)
        raise
    log_auth_event("google_auth_success", email=user.email, user_id=user.id, ip=ip)
    return _to_auth_response(user)


@router.post("/refresh", response_model=TokenPair)
@limiter.limit(settings.rate_limit_anon)
async def refresh(
    request: Request,
    payload: RefreshRequest,
    db=Depends(get_db),
) -> TokenPair:
    ip = get_remote_address(request)
    try:
        user = await AuthService(db).refresh(refresh_token=payload.refresh_token)
    except Exception:
        log_auth_event("token_refresh_failed", ip=ip, success=False)
        raise
    log_auth_event("token_refresh", user_id=user.id, ip=ip)
    access_token, refresh_token, expires_in = AuthService.issue_tokens(user_id=user.id)
    return TokenPair(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=expires_in,
    )


@router.post("/logout")
@limiter.limit(settings.rate_limit_auth)
async def logout(
    request: Request,
    user: User = Depends(get_current_user),
) -> dict[str, str]:
    ip = get_remote_address(request)
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        token_str = auth_header.split(" ", 1)[1]
        token = decode_jwt_token(token_str)
        jti = token.raw.get("jti")
        if jti:
            token_blacklist.revoke(jti, token.exp)
    log_auth_event("logout", user_id=user.id, ip=ip)
    return {"message": "Logged out"}


@router.get("/me", response_model=UserPublic)
@limiter.limit(settings.rate_limit_auth)
async def me(request: Request, user: User = Depends(get_current_user)) -> UserPublic:  # noqa: ARG001
    return _to_user_public(user)
