from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from slowapi.util import get_remote_address

from app.core.audit_log import audit
from app.core.dependencies import get_admin_user, get_db
from app.core.rate_limiter import admin_write_rate_limit, limiter
from app.models.user import User
from app.schemas.feedback import (
    AdminFeedbackItem,
    AdminFeedbackListResponse,
    AdminUpdateFeedbackRequest,
    FeedbackItem,
)
from app.services.feedback_service import FeedbackService

router = APIRouter(prefix="/feedback", tags=["admin-feedback"])


@router.get("/", response_model=AdminFeedbackListResponse)
async def list_feedback(
    admin: User = Depends(get_admin_user),  # noqa: ARG001
    db=Depends(get_db),
    status: str | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
) -> AdminFeedbackListResponse:
    svc = FeedbackService(db)
    items, total = await svc.list_all(status=status, offset=offset, limit=limit)
    return AdminFeedbackListResponse(
        items=[AdminFeedbackItem(**item) for item in items],
        total=total,
    )


@router.put("/{feedback_id}", response_model=FeedbackItem)
@limiter.limit(admin_write_rate_limit)
async def update_feedback(
    request: Request,
    feedback_id: int,
    body: AdminUpdateFeedbackRequest,
    admin: User = Depends(get_admin_user),
    db=Depends(get_db),
) -> FeedbackItem:
    svc = FeedbackService(db)
    fb = await svc.update(
        feedback_id,
        status=body.status.value if body.status else None,
        admin_note=body.admin_note,
    )
    await audit(
        category="admin",
        action="update_feedback",
        user_id=admin.id,
        resource_type="feedback",
        resource_id=feedback_id,
        ip=get_remote_address(request),
        detail={"status": body.status.value if body.status else None},
    )
    return FeedbackItem(
        id=fb.id,
        category=fb.category,
        content=fb.content,
        status=fb.status,
        admin_note=fb.admin_note,
        created_at=fb.created_at,
    )
