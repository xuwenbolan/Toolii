from __future__ import annotations

from fastapi import APIRouter, Depends, File, Request, UploadFile

from app.core.config import settings
from app.core.dependencies import get_verified_user
from app.core.exceptions import AppError
from app.core.file_validation import validate_image_bytes
from app.core.upload_limits import max_image_bytes
from app.core.rate_limiter import dynamic_rate_limit_heavy, limiter
from app.core.task_limiter import acquire_task_slot
from app.core.tool_recording import ToolGatewayRoute
from app.models.user import User
from app.schemas.face_reading import FaceProfileResponse, FullReportResponse
from app.schemas.face_similarity import FaceSimilarityResponse
from app.services.face_similarity_service import FaceSimilarityService
from app.services.physiognomy_service import FaceMapService

router = APIRouter(prefix=f"{settings.api_prefix}/facemap", tags=["facemap"], route_class=ToolGatewayRoute)

_svc = FaceMapService()


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
        if len(data) > max_image_bytes():
            raise AppError(code="FILE_TOO_LARGE", message="File too large", status_code=413)
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
) -> FullReportResponse:
    """Paid tier face report. Credits handled by ToolGatewayRoute."""
    sem = await acquire_task_slot(request)
    try:
        data = await file.read()
        if len(data) > max_image_bytes():
            raise AppError(code="FILE_TOO_LARGE", message="File too large", status_code=413)
        validate_image_bytes(data)
        locale = _normalize_locale(request.headers.get("Accept-Language"))
        result = await _svc.analyze_report(
            image_bytes=data,
            locale=locale,
        )
        return FullReportResponse(**result)
    finally:
        sem.release()


# ---------------------------------------------------------------------------
# Face similarity comparison
# ---------------------------------------------------------------------------

_sim_svc = FaceSimilarityService()


@router.post("/similarity", response_model=FaceSimilarityResponse)
@limiter.limit(dynamic_rate_limit_heavy)
async def face_similarity(
    request: Request,
    file1: UploadFile = File(...),
    file2: UploadFile = File(...),
) -> FaceSimilarityResponse:
    """Compare two face images. Free, no auth required."""
    sem = await acquire_task_slot(request)
    try:
        data1 = await file1.read()
        data2 = await file2.read()
        max_bytes = max_image_bytes()
        if len(data1) > max_bytes or len(data2) > max_bytes:
            raise AppError(code="FILE_TOO_LARGE", message="File too large", status_code=413)
        validate_image_bytes(data1)
        validate_image_bytes(data2)
        locale = _normalize_locale(request.headers.get("Accept-Language"))
        result = await _sim_svc.compare(
            image1_bytes=data1,
            image2_bytes=data2,
            locale=locale,
        )
        return FaceSimilarityResponse(**result)
    finally:
        sem.release()
