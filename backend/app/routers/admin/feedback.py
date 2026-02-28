from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.core.dependencies import get_admin_user, get_db
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
async def update_feedback(
    feedback_id: int,
    body: AdminUpdateFeedbackRequest,
    admin: User = Depends(get_admin_user),  # noqa: ARG001
    db=Depends(get_db),
) -> FeedbackItem:
    svc = FeedbackService(db)
    fb = await svc.update(
        feedback_id,
        status=body.status.value if body.status else None,
        admin_note=body.admin_note,
    )
    return FeedbackItem(
        id=fb.id,
        category=fb.category,
        content=fb.content,
        status=fb.status,
        admin_note=fb.admin_note,
        created_at=fb.created_at,
    )
