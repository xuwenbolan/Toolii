from __future__ import annotations

import json

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi import HTTPException

from app.core.config import settings
from app.core.file_validation import validate_image_bytes
from app.core.rate_limiter import dynamic_rate_limit, limiter
from app.core.task_limiter import acquire_task_slot
from app.schemas.image import BatchResponse, FileResult
from app.services.image_service import ImageService

router = APIRouter(prefix=f"{settings.api_prefix}/image", tags=["image"])


def _max_image_bytes() -> int:
    return settings.max_upload_image_mb * 1024 * 1024


@router.post("/compress", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def compress(
    request: Request,
    file: UploadFile = File(...),
    quality: int | None = Form(None),
    target_kb: int | None = Form(None),
    output_format: str | None = Form(None),
) -> FileResult:
    sem = await acquire_task_slot(request)
    try:
        data = await file.read()
        if len(data) > _max_image_bytes():
            raise HTTPException(status_code=413, detail="File too large")
        validate_image_bytes(data)
        return await ImageService().compress(
            image_bytes=data,
            filename=file.filename or "image",
            quality=quality,
            target_kb=target_kb,
            output_format=output_format,
        )
    finally:
        sem.release()


@router.post("/convert", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def convert(
    request: Request,
    file: UploadFile = File(...),
    output_format: str = Form(...),
    quality: int | None = Form(None),
) -> FileResult:
    sem = await acquire_task_slot(request)
    try:
        data = await file.read()
        if len(data) > _max_image_bytes():
            raise HTTPException(status_code=413, detail="File too large")
        validate_image_bytes(data)
        return await ImageService().convert(
            image_bytes=data,
            filename=file.filename or "image",
            output_format=output_format,
            quality=quality,
        )
    finally:
        sem.release()


@router.post("/mosaic", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def mosaic(
    request: Request,
    file: UploadFile = File(...),
    regions: str | None = Form(None),
    pixel_size: int = Form(12),
) -> FileResult:
    sem = await acquire_task_slot(request)
    try:
        data = await file.read()
        if len(data) > _max_image_bytes():
            raise HTTPException(status_code=413, detail="File too large")
        validate_image_bytes(data)
        parsed = None
        if regions:
            try:
                parsed = json.loads(regions)
            except json.JSONDecodeError as exc:
                raise HTTPException(status_code=400, detail="Invalid regions JSON") from exc
        return await ImageService().mosaic(
            image_bytes=data,
            filename=file.filename or "image",
            regions=parsed,
            pixel_size=pixel_size,
        )
    finally:
        sem.release()


@router.post("/scan-enhance", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def scan_enhance(
    request: Request,
    file: UploadFile = File(...),
    mode: str = Form("bw"),
) -> FileResult:
    sem = await acquire_task_slot(request)
    try:
        data = await file.read()
        if len(data) > _max_image_bytes():
            raise HTTPException(status_code=413, detail="File too large")
        validate_image_bytes(data)
        return await ImageService().scan_enhance(
            image_bytes=data,
            filename=file.filename or "image",
            mode=mode,
        )
    finally:
        sem.release()


@router.post("/batch", response_model=BatchResponse)
@limiter.limit(dynamic_rate_limit)
async def batch(
    request: Request,
    files: list[UploadFile] = File(...),
    action: str = Form("compress"),
    output_format: str | None = Form(None),
    quality: int | None = Form(None),
    target_kb: int | None = Form(None),
) -> BatchResponse:
    if len(files) > settings.max_batch_files:
        raise HTTPException(status_code=413, detail="Too many files")

    sem = await acquire_task_slot(request)
    try:
        total = 0
        payload: list[tuple[str, bytes]] = []
        max_total = settings.max_batch_total_mb * 1024 * 1024
        for f in files:
            data = await f.read()
            total += len(data)
            if total > max_total:
                raise HTTPException(status_code=413, detail="Batch too large")
            if len(data) > _max_image_bytes():
                raise HTTPException(status_code=413, detail="File too large")
            validate_image_bytes(data)
            payload.append((f.filename or "image", data))

        return await ImageService().batch(
            files=payload,
            action=action,
            output_format=output_format,
            quality=quality,
            target_kb=target_kb,
        )
    finally:
        sem.release()
