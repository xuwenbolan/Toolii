from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select

from app.core.audit_log import log_auth_event
from app.core.config import settings
from app.core.dependencies import get_current_user, get_db
from app.core.exceptions import AppError
from app.core.rate_limiter import limiter
from app.core.security import hash_password, verify_password
from app.core.token_blacklist import token_blacklist
from app.models.login_history import LoginHistory
from app.models.user import User
from app.schemas.common import Message
from app.schemas.user import ChangePasswordRequest, DeleteAccountRequest, UpdateProfileRequest, UserPublic
from app.services.email.factory import get_email_service
from app.services.email.lang import parse_lang

router = APIRouter(prefix=f"{settings.api_prefix}/users", tags=["users"])


@router.get("/profile", response_model=UserPublic)
@limiter.limit(settings.rate_limit_auth)
async def profile(request: Request, user: User = Depends(get_current_user)) -> UserPublic:  # noqa: ARG001
    return UserPublic.model_validate(user)


@router.put("/password")
@limiter.limit(settings.rate_limit_auth)
async def change_password(
    request: Request,
    payload: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
) -> JSONResponse:
    if not user.hashed_password:
        raise AppError(
            code="NO_PASSWORD",
            message="This account uses Google login, password cannot be changed",
            status_code=400,
        )
    if not verify_password(payload.current_password, user.hashed_password):
        raise AppError(
            code="WRONG_PASSWORD",
            message="Current password is incorrect",
            status_code=400,
        )
    user.hashed_password = hash_password(payload.new_password)
    await db.commit()
    from slowapi.util import get_remote_address
    ip = get_remote_address(request)
    log_auth_event("password_changed", user_id=user.id, ip=ip)
    return JSONResponse(content={"code": "PASSWORD_CHANGED", "message": "Password changed successfully"})


@router.put("/profile")
@limiter.limit(settings.rate_limit_auth)
async def update_profile(
    request: Request,
    payload: UpdateProfileRequest,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
) -> JSONResponse:
    from slowapi.util import get_remote_address
    ip = get_remote_address(request)

    if payload.name is not None:
        user.name = payload.name

    email_changed = False
    dev_token = None
    if payload.email is not None:
        new_email = payload.email.strip().lower()
        if new_email != user.email:
            # Require password verification for email change
            if user.hashed_password:
                if not payload.current_password:
                    raise AppError(
                        code="PASSWORD_REQUIRED",
                        message="Password is required to change email",
                        status_code=400,
                    )
                if not verify_password(payload.current_password, user.hashed_password):
                    raise AppError(
                        code="WRONG_PASSWORD",
                        message="Current password is incorrect",
                        status_code=400,
                    )
            # Check uniqueness
            result = await db.execute(select(User).where(User.email == new_email))
            if result.scalar_one_or_none() is not None:
                raise AppError(code="EMAIL_EXISTS", message="Email already in use", status_code=409)
            user.email = new_email
            user.email_verified = False
            email_changed = True

    await db.commit()
    await db.refresh(user)

    # Send verification email for new address
    if email_changed:
        from app.services.auth_service import AuthService
        lang = parse_lang(request.headers.get("accept-language"))
        svc = AuthService(db)
        raw_token = await svc._create_verification_token(user.id)
        await db.commit()
        email_svc = get_email_service()
        await email_svc.send_verification_email(
            to_email=user.email,
            token=raw_token,
            base_url=settings.frontend_base_url,
            lang=lang,
        )
        if settings.env == "dev":
            dev_token = raw_token

    log_auth_event("profile_updated", user_id=user.id, ip=ip)

    body: dict = {
        "code": "PROFILE_UPDATED_VERIFY_EMAIL" if email_changed else "PROFILE_UPDATED",
        "message": "Profile updated" + (", please verify new email" if email_changed else ""),
        "user": UserPublic.model_validate(user).model_dump(),
    }
    if dev_token is not None:
        body["_dev_verification_token"] = dev_token
    return JSONResponse(content=body)


@router.delete("/me")
@limiter.limit(settings.rate_limit_auth)
async def delete_me(
    request: Request,
    payload: DeleteAccountRequest,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
) -> JSONResponse:
    from datetime import datetime, timezone
    from slowapi.util import get_remote_address

    # Require identity verification before deletion
    if user.hashed_password:
        if not payload.password:
            raise AppError(
                code="PASSWORD_REQUIRED",
                message="Please enter password to confirm deletion",
                status_code=400,
            )
        if not verify_password(payload.password, user.hashed_password):
            raise AppError(
                code="WRONG_PASSWORD",
                message="Wrong password",
                status_code=400,
            )
    else:
        # Google-only accounts: require email confirmation
        if not payload.confirm_email or payload.confirm_email.strip().lower() != user.email:
            raise AppError(
                code="EMAIL_CONFIRMATION_REQUIRED",
                message="Please enter your email address to confirm deletion",
                status_code=400,
            )

    now = datetime.now(timezone.utc)
    user.is_active = False
    user.deleted_at = now
    user.tokens_revoked_at = now
    await db.commit()

    ip = get_remote_address(request)
    log_auth_event("account_deleted", user_id=user.id, ip=ip)
    return JSONResponse(content={"code": "ACCOUNT_MARKED_DELETION", "message": "Account marked for deletion, recoverable within 7 days by logging in"})


@router.post("/recover")
@limiter.limit(settings.rate_limit_anon)
async def recover_account(
    request: Request,
    db=Depends(get_db),
) -> JSONResponse:
    from datetime import datetime, timedelta, timezone
    from slowapi.util import get_remote_address

    from app.schemas.auth import LoginRequest
    body = await request.json()
    payload = LoginRequest(**body)

    email = payload.email.strip().lower()
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    _generic_recover_error = AppError(
        code="RECOVER_FAILED", message="Unable to recover account", status_code=400,
    )

    if user is None or not user.deleted_at:
        raise _generic_recover_error

    # Check 7-day recovery window
    now = datetime.now(timezone.utc)
    if now - user.deleted_at > timedelta(days=7):
        raise _generic_recover_error

    # Verify password
    if not user.hashed_password or not verify_password(payload.password, user.hashed_password):
        raise _generic_recover_error

    user.is_active = True
    user.deleted_at = None
    user.tokens_revoked_at = None
    await db.commit()

    ip = get_remote_address(request)
    log_auth_event("account_recovered", user_id=user.id, email=user.email, ip=ip)
    return JSONResponse(content={"code": "ACCOUNT_RECOVERED", "message": "Account recovered, please log in again"})


@router.get("/sessions")
@limiter.limit(settings.rate_limit_auth)
async def list_sessions(
    request: Request,  # noqa: ARG001
    user: User = Depends(get_current_user),
    db=Depends(get_db),
) -> JSONResponse:
    """List active sessions (login history entries whose refresh token is not blacklisted)."""
    result = await db.execute(
        select(LoginHistory)
        .where(LoginHistory.user_id == user.id)
        .order_by(LoginHistory.created_at.desc())
        .limit(50)
    )
    entries = result.scalars().all()

    sessions = []
    for entry in entries:
        # Skip entries whose refresh token has been blacklisted
        if entry.refresh_jti and token_blacklist.is_revoked(entry.refresh_jti):
            continue
        sessions.append({
            "id": entry.id,
            "ip": entry.ip,
            "user_agent": entry.user_agent,
            "created_at": entry.created_at.isoformat() if entry.created_at else None,
        })

    return JSONResponse(content={"sessions": sessions})


@router.delete("/sessions/{session_id}")
@limiter.limit(settings.rate_limit_auth)
async def revoke_session(
    request: Request,
    session_id: int,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
) -> JSONResponse:
    """Terminate a specific session by blacklisting its refresh token."""
    from datetime import datetime, timedelta, timezone
    from slowapi.util import get_remote_address

    result = await db.execute(
        select(LoginHistory).where(
            LoginHistory.id == session_id,
            LoginHistory.user_id == user.id,
        )
    )
    entry = result.scalar_one_or_none()
    if entry is None:
        raise AppError(code="SESSION_NOT_FOUND", message="Session not found", status_code=404)

    if entry.refresh_jti:
        await token_blacklist.revoke(
            db,
            jti=entry.refresh_jti,
            user_id=user.id,
            token_type="refresh",
            expires_at=datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days),
        )

    ip = get_remote_address(request)
    log_auth_event("session_revoked", user_id=user.id, ip=ip)
    return JSONResponse(content={"code": "SESSION_TERMINATED", "message": "Session terminated"})
