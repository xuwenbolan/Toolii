from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from slowapi.util import get_remote_address

import logging

from app.core.audit_log import log_auth_event
from app.core.config import settings
from app.core.cookie import clear_refresh_cookie, get_refresh_cookie_name, set_refresh_cookie
from app.core.dependencies import get_current_user, get_db
from app.core.exceptions import UnauthorizedError
from app.core.rate_limiter import limiter
from app.core.security import decode_jwt_token
from app.core.token_blacklist import token_blacklist
from app.models.login_history import LoginHistory
from app.models.user import User
from app.schemas.auth import (
    AccessTokenResponse,
    AuthResponse,
    ForgotPasswordRequest,
    GoogleAuthRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    VerifyEmailRequest,
)
from app.schemas.user import UserPublic
from app.services.auth_service import AuthService

logger = logging.getLogger(__name__)

router = APIRouter(prefix=f"{settings.api_prefix}/auth", tags=["auth"])


def _to_user_public(user: User) -> UserPublic:
    return UserPublic.model_validate(user)


def _build_auth_response(
    user: User, *, extra_body: dict[str, object] | None = None
) -> tuple[JSONResponse, dict]:
    """Build JSONResponse with access token in body and refresh token in HttpOnly cookie.
    Returns (response, token_info) where token_info contains JTIs for login history."""
    token_info = AuthService.issue_tokens(user_id=user.id)
    body = AuthResponse(
        user=_to_user_public(user),
        tokens=AccessTokenResponse(
            access_token=token_info["access_token"],
            expires_in=token_info["expires_in"],
        ),
    ).model_dump()
    if extra_body:
        body.update(extra_body)
    response = JSONResponse(content=body)
    max_age = settings.refresh_token_expire_days * 86400
    set_refresh_cookie(response, token_info["refresh_token"], max_age)
    return response, token_info


async def _record_login(
    db, *, user_id: int, ip: str | None, user_agent: str | None, token_info: dict
) -> None:
    """Record login history entry."""
    entry = LoginHistory(
        user_id=user_id,
        ip=ip,
        user_agent=user_agent,
        token_jti=token_info.get("access_jti"),
        refresh_jti=token_info.get("refresh_jti"),
    )
    db.add(entry)
    await db.commit()


@router.post("/register")
@limiter.limit(settings.rate_limit_anon)
async def register(
    request: Request,
    payload: RegisterRequest,
    db=Depends(get_db),
) -> JSONResponse:
    ip = get_remote_address(request)
    try:
        user, dev_token = await AuthService(db).register(
            email=payload.email, password=payload.password, name=payload.name
        )
    except Exception:
        log_auth_event("register_failed", email=payload.email, ip=ip, success=False)
        raise
    log_auth_event("register_success", email=payload.email, user_id=user.id, ip=ip)
    extra = {"_dev_verification_token": dev_token} if dev_token is not None else None
    response, token_info = _build_auth_response(user, extra_body=extra)
    await _record_login(
        db, user_id=user.id, ip=ip,
        user_agent=request.headers.get("user-agent"), token_info=token_info,
    )
    return response


@router.post("/login")
@limiter.limit(settings.rate_limit_anon)
async def login(
    request: Request,
    payload: LoginRequest,
    db=Depends(get_db),
) -> JSONResponse:
    ip = get_remote_address(request)
    try:
        user = await AuthService(db).login(email=payload.email, password=payload.password)
    except Exception:
        log_auth_event("login_failed", email=payload.email, ip=ip, success=False)
        raise
    log_auth_event("login_success", email=payload.email, user_id=user.id, ip=ip)
    response, token_info = _build_auth_response(user)
    await _record_login(
        db, user_id=user.id, ip=ip,
        user_agent=request.headers.get("user-agent"), token_info=token_info,
    )
    return response


@router.post("/google")
@limiter.limit(settings.rate_limit_anon)
async def google_auth(
    request: Request,
    payload: GoogleAuthRequest,
    db=Depends(get_db),
) -> JSONResponse:
    ip = get_remote_address(request)
    try:
        user = await AuthService(db).google_auth(
            access_token=payload.access_token, link_password=payload.link_password
        )
    except Exception:
        log_auth_event("google_auth_failed", ip=ip, success=False)
        raise
    log_auth_event("google_auth_success", email=user.email, user_id=user.id, ip=ip)
    response, token_info = _build_auth_response(user)
    await _record_login(
        db, user_id=user.id, ip=ip,
        user_agent=request.headers.get("user-agent"), token_info=token_info,
    )
    return response


@router.post("/refresh")
@limiter.limit(settings.rate_limit_anon)
async def refresh(
    request: Request,
    db=Depends(get_db),
) -> JSONResponse:
    ip = get_remote_address(request)
    cookie_value = request.cookies.get(get_refresh_cookie_name())
    if not cookie_value:
        raise UnauthorizedError("Missing refresh token")
    try:
        user = await AuthService(db).refresh(refresh_token=cookie_value)
    except Exception:
        log_auth_event("token_refresh_failed", ip=ip, success=False)
        raise
    log_auth_event("token_refresh", user_id=user.id, ip=ip)
    response, _token_info = _build_auth_response(user)
    return response


@router.post("/logout")
@limiter.limit(settings.rate_limit_auth)
async def logout(
    request: Request,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
) -> JSONResponse:
    ip = get_remote_address(request)
    # Blacklist current access token
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        token_str = auth_header.split(" ", 1)[1]
        decoded = decode_jwt_token(token_str)
        jti = decoded.raw.get("jti")
        if jti:
            await token_blacklist.revoke(
                db,
                jti=jti,
                user_id=user.id,
                token_type="access",
                expires_at=datetime.fromtimestamp(decoded.exp, tz=timezone.utc),
            )
    # Blacklist refresh token from cookie
    cookie_value = request.cookies.get(get_refresh_cookie_name())
    if cookie_value:
        try:
            refresh_decoded = decode_jwt_token(cookie_value)
            refresh_jti = refresh_decoded.raw.get("jti")
            if refresh_jti:
                await token_blacklist.revoke(
                    db,
                    jti=refresh_jti,
                    user_id=user.id,
                    token_type="refresh",
                    expires_at=datetime.fromtimestamp(refresh_decoded.exp, tz=timezone.utc),
                )
        except Exception:  # noqa: BLE001
            logger.debug("Could not blacklist refresh token during logout", exc_info=True)
    log_auth_event("logout", user_id=user.id, ip=ip)
    response = JSONResponse(content={"message": "Logged out"})
    clear_refresh_cookie(response)
    return response


@router.post("/logout-all")
@limiter.limit(settings.rate_limit_auth)
async def logout_all(
    request: Request,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
) -> JSONResponse:
    ip = get_remote_address(request)
    user.tokens_revoked_at = datetime.now(timezone.utc)
    await db.commit()
    log_auth_event("logout_all_devices", user_id=user.id, ip=ip)
    response = JSONResponse(content={"message": "All sessions revoked"})
    clear_refresh_cookie(response)
    return response


@router.get("/me", response_model=UserPublic)
@limiter.limit(settings.rate_limit_auth)
async def me(request: Request, user: User = Depends(get_current_user)) -> UserPublic:  # noqa: ARG001
    return _to_user_public(user)


@router.post("/verify-email")
@limiter.limit(settings.rate_limit_anon)
async def verify_email(
    request: Request,
    payload: VerifyEmailRequest,
    db=Depends(get_db),
) -> JSONResponse:
    ip = get_remote_address(request)
    user = await AuthService(db).verify_email(token=payload.token)
    log_auth_event("email_verified", email=user.email, user_id=user.id, ip=ip)
    return JSONResponse(content={"message": "邮箱验证成功"})


@router.post("/resend-verification")
@limiter.limit("3/hour")
async def resend_verification(
    request: Request,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
) -> JSONResponse:
    ip = get_remote_address(request)
    dev_token = await AuthService(db).resend_verification(user_id=user.id)
    log_auth_event("resend_verification", email=user.email, user_id=user.id, ip=ip)
    body: dict = {"message": "验证邮件已发送"}
    if dev_token is not None:
        body["_dev_verification_token"] = dev_token
    return JSONResponse(content=body)


@router.post("/forgot-password")
@limiter.limit("3/hour")
async def forgot_password(
    request: Request,
    payload: ForgotPasswordRequest,
    db=Depends(get_db),
) -> JSONResponse:
    ip = get_remote_address(request)
    dev_token = await AuthService(db).forgot_password(email=payload.email)
    log_auth_event("forgot_password", email=payload.email, ip=ip)
    # Always return success to prevent email enumeration
    body: dict = {"message": "如果该邮箱已注册，您将收到密码重置邮件"}
    if dev_token is not None:
        body["_dev_reset_token"] = dev_token
    return JSONResponse(content=body)


@router.post("/reset-password")
@limiter.limit(settings.rate_limit_anon)
async def reset_password(
    request: Request,
    payload: ResetPasswordRequest,
    db=Depends(get_db),
) -> JSONResponse:
    ip = get_remote_address(request)
    user = await AuthService(db).reset_password(
        token=payload.token, new_password=payload.password
    )
    log_auth_event("password_reset", email=user.email, user_id=user.id, ip=ip)
    return JSONResponse(content={"message": "密码重置成功，请重新登录"})
