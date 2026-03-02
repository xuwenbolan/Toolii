from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

from app.core.config import settings
from app.core.dependencies import get_db, get_verified_user
from app.core.file_validation import validate_image_bytes
from app.core.rate_limiter import dynamic_rate_limit_heavy, limiter
from app.core.task_limiter import acquire_task_slot
from app.core.tool_recording import ToolRecordingRoute
from app.models.user import User
from app.schemas.face_reading import FaceProfileResponse, FullReportResponse
from app.services.physiognomy_service import FaceMapService

router = APIRouter(prefix=f"{settings.api_prefix}/facemap", tags=["facemap"], route_class=ToolRecordingRoute)

_svc = FaceMapService()


def _max_image_bytes() -> int:
    return settings.max_upload_image_mb * 1024 * 1024


def _normalize_locale(accept_lang: str | None) -> str:
    if not accept_lang:
        return "zh-CN"
    lang = accept_lang.split(",")[0].strip().lower()
    if lang.startswith("en"):
        return "en"
    return "zh-CN"


@router.post("/profile", response_model=FaceProfileResponse)
@limiter.limit(dynamic_rate_limit_heavy)
async def face_profile(
    request: Request,
    file: UploadFile = File(...),
) -> FaceProfileResponse:
    """Free tier face profile. No auth required."""
    sem = await acquire_task_slot(request)
    try:
        data = await file.read()
        if len(data) > _max_image_bytes():
            raise HTTPException(status_code=413, detail="File too large")
        validate_image_bytes(data)
        locale = _normalize_locale(request.headers.get("Accept-Language"))
        result = await _svc.analyze_profile(image_bytes=data, locale=locale)
        return FaceProfileResponse(**result)
    finally:
        sem.release()


@router.post("/report", response_model=FullReportResponse)
@limiter.limit(dynamic_rate_limit_heavy)
async def face_report(
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(get_verified_user),
    db=Depends(get_db),
) -> FullReportResponse:
    """Paid tier face report. Requires auth + 1 credit."""
    sem = await acquire_task_slot(request)
    try:
        data = await file.read()
        if len(data) > _max_image_bytes():
            raise HTTPException(status_code=413, detail="File too large")
        validate_image_bytes(data)
        locale = _normalize_locale(request.headers.get("Accept-Language"))
        result = await _svc.analyze_report(
            image_bytes=data,
            locale=locale,
            user_id=user.id,
            db=db,
        )
        return FullReportResponse(**result)
    finally:
        sem.release()
