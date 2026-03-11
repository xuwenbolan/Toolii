from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile

logger = logging.getLogger(__name__)

from app.core.config import settings
from app.core.dependencies import tool_credit_cost, tool_owner_user_id
from app.core.exceptions import AppError
from app.core.file_validation import validate_image_bytes
from app.core.upload_limits import max_image_bytes
from app.core.rate_limiter import dynamic_rate_limit, limiter
from app.core.task_limiter import task_slot
from app.core.tool_recording import ToolGatewayRoute
from app.schemas.image import FileResult, OcrResult, SegmentResult
from app.services.image_service import ImageService

router = APIRouter(prefix=f"{settings.api_prefix}/image", tags=["image"], route_class=ToolGatewayRoute)


# ── Shared dependency: read + validate ────────────────────────────────


@dataclass
class ImageInput:
    data: bytes
    filename: str


async def validated_image(
    file: UploadFile = File(...),
) -> ImageInput:
    """FastAPI dependency: read file, check size, validate format."""
    data = await file.read()
    if len(data) > max_image_bytes():
        raise AppError(code="FILE_TOO_LARGE", message="File too large", status_code=413)
    validate_image_bytes(data)
    logger.debug("Image accepted: filename=%s size=%d", file.filename, len(data))
    return ImageInput(data=data, filename=file.filename or "image")


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
    async with task_slot(request):
        return await ImageService(owner_user_id=tool_owner_user_id(request)).compress(
            image_bytes=img.data, filename=img.filename,
            quality=quality, target_kb=target_kb, output_format=output_format,
            credit_cost=tool_credit_cost(request),
        )


@router.post("/convert", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def convert(
    request: Request,
    img: ImageInput = Depends(validated_image),
    output_format: str = Form(...),
    quality: int | None = Form(None),
) -> FileResult:
    async with task_slot(request):
        return await ImageService(owner_user_id=tool_owner_user_id(request)).convert(
            image_bytes=img.data, filename=img.filename,
            output_format=output_format, quality=quality,
            credit_cost=tool_credit_cost(request),
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
            raise AppError(code="INVALID_JSON", message="Invalid regions JSON") from exc
    async with task_slot(request):
        return await ImageService(owner_user_id=tool_owner_user_id(request)).mosaic(
            image_bytes=img.data, filename=img.filename,
            regions=parsed, pixel_size=pixel_size,
            credit_cost=tool_credit_cost(request),
        )


@router.post("/scan-enhance", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def scan_enhance(
    request: Request,
    img: ImageInput = Depends(validated_image),
    mode: str = Form("bw"),
) -> FileResult:
    async with task_slot(request):
        return await ImageService(owner_user_id=tool_owner_user_id(request)).scan_enhance(
            image_bytes=img.data, filename=img.filename, mode=mode,
            credit_cost=tool_credit_cost(request),
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
    async with task_slot(request):
        return await ImageService(owner_user_id=tool_owner_user_id(request)).remove_bg(
            image_bytes=img.data, filename=img.filename,
            credit_cost=tool_credit_cost(request), **params,
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
    async with task_slot(request):
        return await ImageService(owner_user_id=tool_owner_user_id(request)).upscale(
            image_bytes=img.data, filename=img.filename, scale=scale,
            credit_cost=tool_credit_cost(request), **params,
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
    async with task_slot(request):
        return await ImageService(owner_user_id=tool_owner_user_id(request)).restore_face(
            image_bytes=img.data, filename=img.filename, weight=weight,
            credit_cost=tool_credit_cost(request), **params,
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
    async with task_slot(request):
        return await ImageService(owner_user_id=tool_owner_user_id(request)).denoise(
            image_bytes=img.data, filename=img.filename,
            strength=strength, task=task,
            credit_cost=tool_credit_cost(request), **params,
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
    async with task_slot(request):
        return await ImageService(owner_user_id=tool_owner_user_id(request)).colorize(
            image_bytes=img.data, filename=img.filename,
            credit_cost=tool_credit_cost(request), **params,
        )


@router.post("/inpaint", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def inpaint(
    request: Request,
    file: UploadFile = File(...),
    mask: UploadFile = File(...),
    model: str | None = Form(None),
) -> FileResult:
    data = await file.read()
    mask_data = await mask.read()
    if len(data) > max_image_bytes():
        raise AppError(code="FILE_TOO_LARGE", message="File too large", status_code=413)
    if len(mask_data) > max_image_bytes():
        raise AppError(code="FILE_TOO_LARGE", message="Mask file too large", status_code=413)
    validate_image_bytes(data)
    validate_image_bytes(mask_data)
    params: dict[str, Any] = {}
    if model is not None:
        params["model"] = model
    async with task_slot(request):
        return await ImageService(owner_user_id=tool_owner_user_id(request)).inpaint(
            image_bytes=data, mask_bytes=mask_data,
            filename=file.filename or "image",
            credit_cost=tool_credit_cost(request), **params,
        )


@router.post("/ocr", response_model=OcrResult)
@limiter.limit(dynamic_rate_limit)
async def ocr(
    request: Request,
    img: ImageInput = Depends(validated_image),
    lang: str = Form("ch_en"),
) -> OcrResult:
    async with task_slot(request):
        return await ImageService(owner_user_id=tool_owner_user_id(request)).ocr(image_bytes=img.data, lang=lang)


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
            raise AppError(code="INVALID_JSON", message="Invalid points JSON") from exc
    if boxes:
        try:
            parsed_boxes = json.loads(boxes)
        except json.JSONDecodeError as exc:
            raise AppError(code="INVALID_JSON", message="Invalid boxes JSON") from exc
    async with task_slot(request):
        return await ImageService(owner_user_id=tool_owner_user_id(request)).segment(
            image_bytes=img.data, points=parsed_points, boxes=parsed_boxes,
            multimask=multimask,
        )
