from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from slowapi.util import get_remote_address

from app.core.audit_log import audit
from app.core.config import settings
from app.core.dependencies import get_current_user, get_db
from app.models.user import User
from app.schemas.feedback import (
    FeedbackCreateRequest,
    FeedbackItem,
    FeedbackListResponse,
)
from app.services.feedback_service import FeedbackService

router = APIRouter(prefix=f"{settings.api_prefix}/feedback", tags=["feedback"])


@router.post("/", response_model=FeedbackItem)
async def submit_feedback(
    request: Request,
    body: FeedbackCreateRequest,
    user: User = Depends(get_current_user),
    db=Depends(get_db),
) -> FeedbackItem:
    svc = FeedbackService(db)
    fb = await svc.create(user.id, body.category.value, body.content)
    await audit(
        category="user",
        action="submit_feedback",
        user_id=user.id,
        resource_type="feedback",
        resource_id=fb.id,
        ip=get_remote_address(request),
        detail={"feedback_category": body.category.value},
    )
    return FeedbackItem(
        id=fb.id,
        category=fb.category,
        content=fb.content,
        status=fb.status,
        admin_note=fb.admin_note,
        created_at=fb.created_at,
    )


@router.get("/", response_model=FeedbackListResponse)
async def list_my_feedback(
    user: User = Depends(get_current_user),
    db=Depends(get_db),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
) -> FeedbackListResponse:
    svc = FeedbackService(db)
    items, total = await svc.list_by_user(user.id, offset=offset, limit=limit)
    return FeedbackListResponse(
        items=[
            FeedbackItem(
                id=fb.id,
                category=fb.category,
                content=fb.content,
                status=fb.status,
                admin_note=fb.admin_note,
                created_at=fb.created_at,
            )
            for fb in items
        ],
        total=total,
    )
