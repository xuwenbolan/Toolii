from __future__ import annotations

from fastapi import APIRouter, Depends, File, Request, UploadFile

from app.core.config import settings
from app.core.dependencies import get_db, get_verified_user
from app.core.exceptions import AppError
from app.core.file_validation import validate_image_bytes
from app.core.upload_limits import max_image_bytes
from app.core.rate_limiter import dynamic_rate_limit, dynamic_rate_limit_heavy, limiter
from app.core.task_limiter import task_slot
from app.core.tool_recording import ToolGatewayRoute
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

# Gateway router for final-output endpoints (export/layout)
router = APIRouter(
    prefix=f"{settings.api_prefix}/photo",
    tags=["photo"],
    route_class=ToolGatewayRoute,
)

# Plain router for preparatory and read-only endpoints
router_public = APIRouter(prefix=f"{settings.api_prefix}/photo", tags=["photo"])


@router_public.post("/upload", response_model=PhotoUploadResponse)
@limiter.limit(dynamic_rate_limit_heavy)
async def upload(
    request: Request,
    file: UploadFile = File(...),
) -> PhotoUploadResponse:
    async with task_slot(request):
        data = await file.read()
        if len(data) > max_image_bytes():
            raise AppError(code="FILE_TOO_LARGE", message="File too large", status_code=413)
        validate_image_bytes(data)
        return await PhotoService().upload_and_prepare(
            image_bytes=data,
            filename=file.filename or "photo",
            content_type=file.content_type or "application/octet-stream",
        )


@router_public.post("/preview", response_model=PhotoPreviewResponse)
@limiter.limit(dynamic_rate_limit)
async def preview(
    request: Request,
    payload: PhotoPreviewRequest,
) -> PhotoPreviewResponse:
    async with task_slot(request):
        return await PhotoService().preview(
            upload_id=payload.upload_id,
            standard_code=payload.standard,
            background_color=payload.background_color,
            adjust=payload.adjust.model_dump() if payload.adjust is not None else None,
        )


@router.post("/export", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def export(
    request: Request,
    payload: PhotoExportRequest,
    user: User = Depends(get_verified_user),
    db=Depends(get_db),
) -> FileResult:
    async with task_slot(request):
        return await PhotoService().export(processed_id=payload.processed_id, user_id=user.id, db=db)


@router.post("/layout", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def layout(
    request: Request,
    payload: PhotoLayoutRequest,
    user: User = Depends(get_verified_user),
    db=Depends(get_db),
) -> FileResult:
    async with task_slot(request):
        return await PhotoService().layout(
            processed_id=payload.processed_id,
            copies=payload.copies,
            user_id=user.id,
            db=db,
        )


@router_public.get("/standards", response_model=list[PhotoStandard])
async def standards() -> list[PhotoStandard]:
    return PhotoService().get_standards()
