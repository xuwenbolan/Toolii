from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.core.config import settings
from app.core.dependencies import get_current_user, get_db
from app.core.rate_limiter import limiter
from app.models.user import User
from app.schemas.common import Message
from app.schemas.user import UserPublic

router = APIRouter(prefix=f"{settings.api_prefix}/users", tags=["users"])


@router.get("/profile", response_model=UserPublic)
@limiter.limit(settings.rate_limit_auth)
async def profile(request: Request, user: User = Depends(get_current_user)) -> UserPublic:  # noqa: ARG001
    return UserPublic.model_validate(user)


@router.delete("/me", response_model=Message)
@limiter.limit(settings.rate_limit_auth)
async def delete_me(
    request: Request,  # noqa: ARG001
    user: User = Depends(get_current_user),
    db=Depends(get_db),
) -> Message:
    user.is_active = False
    await db.commit()
    return Message(message="Account deleted")
