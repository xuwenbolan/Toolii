from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile

logger = logging.getLogger(__name__)

from app.core.config import settings
from app.core.dependencies import tool_credit_cost, tool_owner_user_id
from app.core.exceptions import AppError
from app.core.file_validation import check_pdf_page_count, validate_image_bytes, validate_pdf_bytes
from app.core.upload_limits import max_image_bytes, max_pdf_bytes
from app.core.rate_limiter import dynamic_rate_limit, limiter
from app.core.task_limiter import task_slot
from app.core.tool_recording import ToolGatewayRoute
from app.schemas.pdf import FileResult, PdfPagesOperation
from app.services.pdf_service import PdfService

router = APIRouter(prefix=f"{settings.api_prefix}/pdf", tags=["pdf"], route_class=ToolGatewayRoute)


async def validate_pdf_upload(file: UploadFile = File(...)) -> tuple[UploadFile, bytes]:
    data = await file.read()
    if len(data) > max_pdf_bytes():
        raise AppError(code="FILE_TOO_LARGE", message="File too large", status_code=413)
    validate_pdf_bytes(data)
    check_pdf_page_count(data)
    logger.debug("PDF accepted: filename=%s size=%d", file.filename, len(data))
    return file, data


def _parse_int_list(raw: str | None, field_name: str) -> list[int] | None:
    if raw is None or raw.strip() == "":
        return None
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise AppError(code="INVALID_JSON", message=f"Invalid {field_name} JSON") from exc
    if not isinstance(value, list) or not all(isinstance(item, int) for item in value):
        raise AppError(code="INVALID_JSON", message=f"{field_name} must be a JSON array of integers")
    return [int(item) for item in value]


@router.post("/compress", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def compress(
    request: Request,
    validated: tuple[UploadFile, bytes] = Depends(validate_pdf_upload),
    target_kb: int | None = Form(None),
) -> FileResult:
    async with task_slot(request):
        file, data = validated
        return await PdfService(owner_user_id=tool_owner_user_id(request)).compress(
            pdf_bytes=data,
            filename=file.filename or "document.pdf",
            target_kb=target_kb,
            credit_cost=tool_credit_cost(request),
        )


@router.post("/merge", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def merge(
    request: Request,
    files: list[UploadFile] = File(...),
) -> FileResult:
    if len(files) < 2:
        raise AppError(code="TOO_FEW_FILES", message="At least 2 files are required")
    if len(files) > settings.max_batch_files:
        raise AppError(code="TOO_MANY_FILES", message="Too many files", status_code=413)

    async with task_slot(request):
        payload: list[tuple[str, bytes]] = []
        total = 0
        max_total = settings.max_batch_total_mb * 1024 * 1024
        for file in files:
            data = await file.read()
            if len(data) > max_pdf_bytes():
                raise AppError(code="FILE_TOO_LARGE", message="File too large", status_code=413)
            validate_pdf_bytes(data)
            check_pdf_page_count(data)
            total += len(data)
            if total > max_total:
                raise AppError(code="BATCH_TOO_LARGE", message="Batch too large", status_code=413)
            payload.append((file.filename or "document.pdf", data))
        return await PdfService(owner_user_id=tool_owner_user_id(request)).merge(
            pdf_files=payload, credit_cost=tool_credit_cost(request),
        )


@router.post("/pages", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def pages(
    request: Request,
    validated: tuple[UploadFile, bytes] = Depends(validate_pdf_upload),
    operation: PdfPagesOperation = Form(...),
    pages: str | None = Form(None),
    order: str | None = Form(None),
    rotation: int = Form(90),
) -> FileResult:
    async with task_slot(request):
        file, data = validated
        parsed_pages = _parse_int_list(pages, "pages")
        parsed_order = _parse_int_list(order, "order")
        return await PdfService(owner_user_id=tool_owner_user_id(request)).pages(
            pdf_bytes=data,
            filename=file.filename or "document.pdf",
            operation=operation,
            pages=parsed_pages,
            order=parsed_order,
            rotation=rotation,
            credit_cost=tool_credit_cost(request),
        )


@router.post("/split", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def split(
    request: Request,
    validated: tuple[UploadFile, bytes] = Depends(validate_pdf_upload),
    ranges: str = Form(...),
) -> FileResult:
    async with task_slot(request):
        file, data = validated
        return await PdfService(owner_user_id=tool_owner_user_id(request)).split(
            pdf_bytes=data,
            filename=file.filename or "document.pdf",
            ranges=ranges,
            credit_cost=tool_credit_cost(request),
        )


@router.post("/from-images", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def from_images(
    request: Request,
    files: list[UploadFile] = File(...),
    dpi: int = Form(150),
) -> FileResult:
    if len(files) == 0:
        raise AppError(code="NO_FILES", message="At least 1 file is required")
    if len(files) > settings.max_batch_files:
        raise AppError(code="TOO_MANY_FILES", message="Too many files", status_code=413)

    async with task_slot(request):
        payload: list[tuple[str, bytes]] = []
        total = 0
        max_total = settings.max_batch_total_mb * 1024 * 1024
        for file in files:
            data = await file.read()
            if len(data) > max_image_bytes():
                raise AppError(code="FILE_TOO_LARGE", message="File too large", status_code=413)
            validate_image_bytes(data)
            total += len(data)
            if total > max_total:
                raise AppError(code="BATCH_TOO_LARGE", message="Batch too large", status_code=413)
            payload.append((file.filename or "image", data))

        return await PdfService(owner_user_id=tool_owner_user_id(request)).from_images(
            image_files=payload, dpi=dpi, credit_cost=tool_credit_cost(request),
        )
