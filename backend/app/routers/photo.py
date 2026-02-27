from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi import Depends

from app.core.config import settings
from app.core.dependencies import get_current_user, get_db, get_verified_user
from app.core.file_validation import validate_image_bytes
from app.core.rate_limiter import dynamic_rate_limit, dynamic_rate_limit_heavy, limiter
from app.core.task_limiter import acquire_task_slot
from app.models.user import User
from app.schemas.image import FileResult
from app.schemas.photo import (
    PhotoExportRequest,
    PhotoLayoutRequest,
    PhotoPreviewRequest,
    PhotoPreviewResponse,
    PhotoStandard,
    PhotoUploadResponse,
)
from app.services.photo_service import PhotoService

router = APIRouter(prefix=f"{settings.api_prefix}/photo", tags=["photo"])


def _max_image_bytes() -> int:
    return settings.max_upload_image_mb * 1024 * 1024


@router.post("/upload", response_model=PhotoUploadResponse)
@limiter.limit(dynamic_rate_limit_heavy)
async def upload(
    request: Request,
    file: UploadFile = File(...),
) -> PhotoUploadResponse:
    sem = await acquire_task_slot(request)
    try:
        data = await file.read()
        if len(data) > _max_image_bytes():
            raise HTTPException(status_code=413, detail="File too large")
        validate_image_bytes(data)
        return await PhotoService().upload_and_prepare(
            image_bytes=data,
            filename=file.filename or "photo",
            content_type=file.content_type or "application/octet-stream",
        )
    finally:
        sem.release()


@router.post("/preview", response_model=PhotoPreviewResponse)
@limiter.limit(dynamic_rate_limit)
async def preview(
    request: Request,
    payload: PhotoPreviewRequest,
) -> PhotoPreviewResponse:
    sem = await acquire_task_slot(request)
    try:
        return await PhotoService().preview(
            upload_id=payload.upload_id,
            standard_code=payload.standard,
            background_color=payload.background_color,
        )
    finally:
        sem.release()


@router.post("/export", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def export(
    request: Request,
    payload: PhotoExportRequest,
    user: User = Depends(get_verified_user),
    db=Depends(get_db),
) -> FileResult:
    sem = await acquire_task_slot(request)
    try:
        return await PhotoService().export(processed_id=payload.processed_id, user_id=user.id, db=db)
    finally:
        sem.release()


@router.post("/layout", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def layout(
    request: Request,
    payload: PhotoLayoutRequest,
    user: User = Depends(get_verified_user),
    db=Depends(get_db),
) -> FileResult:
    sem = await acquire_task_slot(request)
    try:
        return await PhotoService().layout(
            processed_id=payload.processed_id,
            user_id=user.id,
            db=db,
            copies=payload.copies,
        )
    finally:
        sem.release()


@router.get("/standards", response_model=list[PhotoStandard])
async def standards() -> list[PhotoStandard]:
    return PhotoService().get_standards()
