from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from app.core.config import settings
from app.core.file_validation import validate_image_bytes
from app.core.rate_limiter import dynamic_rate_limit, limiter
from app.core.task_limiter import acquire_task_slot
from app.core.tool_recording import ToolRecordingRoute
from app.schemas.image import FileResult, OcrResult, SegmentResult
from app.services.image_service import ImageService

router = APIRouter(prefix=f"{settings.api_prefix}/image", tags=["image"], route_class=ToolRecordingRoute)


def _max_image_bytes() -> int:
    return settings.max_upload_image_mb * 1024 * 1024


def _credit_cost(request: Request) -> int:
    """Read tool credit_cost injected by ToolGatewayRoute."""
    return getattr(request.state, "tool_credit_cost", 0)


def _owner_user_id(request: Request) -> int | None:
    return getattr(request.state, "tool_user_id", None)


# ── Shared dependency: read + validate + acquire task slot ────────────


@dataclass
class ImageInput:
    data: bytes
    filename: str
    sem: asyncio.Semaphore


async def validated_image(
    request: Request,
    file: UploadFile = File(...),
) -> AsyncGenerator[ImageInput, None]:
    """FastAPI dependency: read file, check size, validate format, acquire task slot."""
    sem = await acquire_task_slot(request)
    try:
        data = await file.read()
        if len(data) > _max_image_bytes():
            raise HTTPException(status_code=413, detail="File too large")
        validate_image_bytes(data)
        yield ImageInput(data=data, filename=file.filename or "image", sem=sem)
    finally:
        sem.release()


# ── Local CPU endpoints ───────────────────────────────────────────────


@router.post("/compress", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def compress(
    request: Request,
    img: ImageInput = Depends(validated_image),
    quality: int | None = Form(None),
    target_kb: int | None = Form(None),
    output_format: str | None = Form(None),
) -> FileResult:
    return await ImageService(owner_user_id=_owner_user_id(request)).compress(
        image_bytes=img.data, filename=img.filename,
        quality=quality, target_kb=target_kb, output_format=output_format,
        credit_cost=_credit_cost(request),
    )


@router.post("/convert", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def convert(
    request: Request,
    img: ImageInput = Depends(validated_image),
    output_format: str = Form(...),
    quality: int | None = Form(None),
) -> FileResult:
    return await ImageService(owner_user_id=_owner_user_id(request)).convert(
        image_bytes=img.data, filename=img.filename,
        output_format=output_format, quality=quality,
        credit_cost=_credit_cost(request),
    )


@router.post("/mosaic", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def mosaic(
    request: Request,
    img: ImageInput = Depends(validated_image),
    regions: str | None = Form(None),
    pixel_size: int = Form(12),
) -> FileResult:
    parsed = None
    if regions:
        try:
            parsed = json.loads(regions)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Invalid regions JSON") from exc
    return await ImageService(owner_user_id=_owner_user_id(request)).mosaic(
        image_bytes=img.data, filename=img.filename,
        regions=parsed, pixel_size=pixel_size,
        credit_cost=_credit_cost(request),
    )


@router.post("/scan-enhance", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def scan_enhance(
    request: Request,
    img: ImageInput = Depends(validated_image),
    mode: str = Form("bw"),
) -> FileResult:
    return await ImageService(owner_user_id=_owner_user_id(request)).scan_enhance(
        image_bytes=img.data, filename=img.filename, mode=mode,
        credit_cost=_credit_cost(request),
    )


# ── GPU endpoints (via Cortex) ────────────────────────────────────────


@router.post("/remove-bg", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def remove_bg(
    request: Request,
    img: ImageInput = Depends(validated_image),
    model: str | None = Form(None),
    output_type: str | None = Form(None),
) -> FileResult:
    params: dict[str, Any] = {}
    if model is not None:
        params["model"] = model
    if output_type is not None:
        params["output_type"] = output_type
    return await ImageService(owner_user_id=_owner_user_id(request)).remove_bg(
        image_bytes=img.data, filename=img.filename,
        credit_cost=_credit_cost(request), **params,
    )


@router.post("/upscale", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def upscale(
    request: Request,
    img: ImageInput = Depends(validated_image),
    scale: int = Form(4),
    model: str | None = Form(None),
    denoise_strength: float | None = Form(None),
    face_enhance: bool = Form(False),
) -> FileResult:
    params: dict[str, Any] = {}
    if model is not None:
        params["model"] = model
    if denoise_strength is not None:
        params["denoise_strength"] = denoise_strength
    if face_enhance:
        params["face_enhance"] = True
    return await ImageService(owner_user_id=_owner_user_id(request)).upscale(
        image_bytes=img.data, filename=img.filename, scale=scale,
        credit_cost=_credit_cost(request), **params,
    )


@router.post("/restore-face", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def restore_face(
    request: Request,
    img: ImageInput = Depends(validated_image),
    weight: float = Form(0.5),
    upscale: int | None = Form(None),
) -> FileResult:
    params: dict[str, Any] = {}
    if upscale is not None:
        params["upscale"] = upscale
    return await ImageService(owner_user_id=_owner_user_id(request)).restore_face(
        image_bytes=img.data, filename=img.filename, weight=weight,
        credit_cost=_credit_cost(request), **params,
    )


@router.post("/denoise", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def denoise(
    request: Request,
    img: ImageInput = Depends(validated_image),
    strength: float = Form(1.0),
    task: str = Form("denoise"),
    model_width: int | None = Form(None),
) -> FileResult:
    params: dict[str, Any] = {}
    if model_width is not None:
        params["model_width"] = model_width
    return await ImageService(owner_user_id=_owner_user_id(request)).denoise(
        image_bytes=img.data, filename=img.filename,
        strength=strength, task=task,
        credit_cost=_credit_cost(request), **params,
    )


@router.post("/colorize", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def colorize(
    request: Request,
    img: ImageInput = Depends(validated_image),
    model: str | None = Form(None),
) -> FileResult:
    params: dict[str, Any] = {}
    if model is not None:
        params["model"] = model
    return await ImageService(owner_user_id=_owner_user_id(request)).colorize(
        image_bytes=img.data, filename=img.filename,
        credit_cost=_credit_cost(request), **params,
    )


@router.post("/inpaint", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def inpaint(
    request: Request,
    file: UploadFile = File(...),
    mask: UploadFile = File(...),
    model: str | None = Form(None),
) -> FileResult:
    # inpaint needs two file uploads so cannot use validated_image dependency
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
        params: dict[str, Any] = {}
        if model is not None:
            params["model"] = model
        return await ImageService(owner_user_id=_owner_user_id(request)).inpaint(
            image_bytes=data, mask_bytes=mask_data,
            filename=file.filename or "image",
            credit_cost=_credit_cost(request), **params,
        )
    finally:
        sem.release()


@router.post("/ocr", response_model=OcrResult)
@limiter.limit(dynamic_rate_limit)
async def ocr(
    request: Request,
    img: ImageInput = Depends(validated_image),
    lang: str = Form("ch_en"),
) -> OcrResult:
    return await ImageService(owner_user_id=_owner_user_id(request)).ocr(image_bytes=img.data, lang=lang)


@router.post("/segment", response_model=SegmentResult)
@limiter.limit(dynamic_rate_limit)
async def segment(
    request: Request,
    img: ImageInput = Depends(validated_image),
    points: str | None = Form(None),
    boxes: str | None = Form(None),
    multimask: bool = Form(False),
) -> SegmentResult:
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
    return await ImageService(owner_user_id=_owner_user_id(request)).segment(
        image_bytes=img.data, points=parsed_points, boxes=parsed_boxes,
        multimask=multimask,
    )
