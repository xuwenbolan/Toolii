from __future__ import annotations

import json

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi import HTTPException

from app.core.config import settings
from app.core.file_validation import validate_image_bytes
from app.core.rate_limiter import dynamic_rate_limit, limiter
from app.core.task_limiter import acquire_task_slot
from app.schemas.image import FileResult, OcrResult, SegmentResult
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


@router.post("/remove-bg", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def remove_bg(
    request: Request,
    file: UploadFile = File(...),
) -> FileResult:
    sem = await acquire_task_slot(request)
    try:
        data = await file.read()
        if len(data) > _max_image_bytes():
            raise HTTPException(status_code=413, detail="File too large")
        validate_image_bytes(data)
        return await ImageService().remove_bg(
            image_bytes=data,
            filename=file.filename or "image",
        )
    finally:
        sem.release()


@router.post("/upscale", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def upscale(
    request: Request,
    file: UploadFile = File(...),
    scale: int = Form(4),
) -> FileResult:
    sem = await acquire_task_slot(request)
    try:
        data = await file.read()
        if len(data) > _max_image_bytes():
            raise HTTPException(status_code=413, detail="File too large")
        validate_image_bytes(data)
        return await ImageService().upscale(
            image_bytes=data,
            filename=file.filename or "image",
            scale=scale,
        )
    finally:
        sem.release()


@router.post("/restore-face", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def restore_face(
    request: Request,
    file: UploadFile = File(...),
    w: float = Form(0.5),
) -> FileResult:
    sem = await acquire_task_slot(request)
    try:
        data = await file.read()
        if len(data) > _max_image_bytes():
            raise HTTPException(status_code=413, detail="File too large")
        validate_image_bytes(data)
        return await ImageService().restore_face(
            image_bytes=data,
            filename=file.filename or "image",
            w=w,
        )
    finally:
        sem.release()


@router.post("/denoise", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def denoise(
    request: Request,
    file: UploadFile = File(...),
    strength: float = Form(0.5),
) -> FileResult:
    sem = await acquire_task_slot(request)
    try:
        data = await file.read()
        if len(data) > _max_image_bytes():
            raise HTTPException(status_code=413, detail="File too large")
        validate_image_bytes(data)
        return await ImageService().denoise(
            image_bytes=data,
            filename=file.filename or "image",
            strength=strength,
        )
    finally:
        sem.release()


@router.post("/colorize", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def colorize(
    request: Request,
    file: UploadFile = File(...),
) -> FileResult:
    sem = await acquire_task_slot(request)
    try:
        data = await file.read()
        if len(data) > _max_image_bytes():
            raise HTTPException(status_code=413, detail="File too large")
        validate_image_bytes(data)
        return await ImageService().colorize(
            image_bytes=data,
            filename=file.filename or "image",
        )
    finally:
        sem.release()


@router.post("/inpaint", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def inpaint(
    request: Request,
    file: UploadFile = File(...),
    mask: UploadFile = File(...),
) -> FileResult:
    sem = await acquire_task_slot(request)
    try:
        data = await file.read()
        mask_data = await mask.read()
        if len(data) > _max_image_bytes():
            raise HTTPException(status_code=413, detail="File too large")
        if len(mask_data) > _max_image_bytes():
            raise HTTPException(status_code=413, detail="Mask file too large")
        validate_image_bytes(data)
        validate_image_bytes(mask_data)
        return await ImageService().inpaint(
            image_bytes=data,
            mask_bytes=mask_data,
            filename=file.filename or "image",
        )
    finally:
        sem.release()


@router.post("/ocr", response_model=OcrResult)
@limiter.limit(dynamic_rate_limit)
async def ocr(
    request: Request,
    file: UploadFile = File(...),
    lang: str = Form("ch_en"),
) -> OcrResult:
    sem = await acquire_task_slot(request)
    try:
        data = await file.read()
        if len(data) > _max_image_bytes():
            raise HTTPException(status_code=413, detail="File too large")
        validate_image_bytes(data)
        return await ImageService().ocr(image_bytes=data, lang=lang)
    finally:
        sem.release()


@router.post("/segment", response_model=SegmentResult)
@limiter.limit(dynamic_rate_limit)
async def segment(
    request: Request,
    file: UploadFile = File(...),
    points: str | None = Form(None),
    boxes: str | None = Form(None),
) -> SegmentResult:
    sem = await acquire_task_slot(request)
    try:
        data = await file.read()
        if len(data) > _max_image_bytes():
            raise HTTPException(status_code=413, detail="File too large")
        validate_image_bytes(data)
        parsed_points = None
        parsed_boxes = None
        if points:
            try:
                parsed_points = json.loads(points)
            except json.JSONDecodeError as exc:
                raise HTTPException(status_code=400, detail="Invalid points JSON") from exc
        if boxes:
            try:
                parsed_boxes = json.loads(boxes)
            except json.JSONDecodeError as exc:
                raise HTTPException(status_code=400, detail="Invalid boxes JSON") from exc
        return await ImageService().segment(
            image_bytes=data,
            points=parsed_points,
            boxes=parsed_boxes,
        )
    finally:
        sem.release()
