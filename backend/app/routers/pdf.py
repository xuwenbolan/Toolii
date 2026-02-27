from __future__ import annotations

import json

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi import Depends

from app.core.config import settings
from app.core.file_validation import validate_image_bytes, validate_pdf_bytes
from app.core.rate_limiter import dynamic_rate_limit, limiter
from app.core.task_limiter import acquire_task_slot
from app.schemas.pdf import FileResult, PdfPagesOperation
from app.services.pdf_service import PdfService

router = APIRouter(prefix=f"{settings.api_prefix}/pdf", tags=["pdf"])


def _max_pdf_bytes() -> int:
    return settings.max_upload_pdf_mb * 1024 * 1024


def _max_image_bytes() -> int:
    return settings.max_upload_image_mb * 1024 * 1024


async def validate_pdf_upload(file: UploadFile = File(...)) -> tuple[UploadFile, bytes]:
    data = await file.read()
    if len(data) > _max_pdf_bytes():
        raise HTTPException(status_code=413, detail="File too large")
    validate_pdf_bytes(data)
    return file, data


def _parse_int_list(raw: str | None, field_name: str) -> list[int] | None:
    if raw is None or raw.strip() == "":
        return None
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid {field_name} JSON") from exc
    if not isinstance(value, list) or not all(isinstance(item, int) for item in value):
        raise HTTPException(status_code=400, detail=f"{field_name} must be a JSON array of integers")
    return [int(item) for item in value]


@router.post("/compress", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def compress(
    request: Request,
    validated: tuple[UploadFile, bytes] = Depends(validate_pdf_upload),
    target_kb: int | None = Form(None),
) -> FileResult:
    sem = await acquire_task_slot(request)
    try:
        file, data = validated
        return await PdfService().compress(
            pdf_bytes=data,
            filename=file.filename or "document.pdf",
            target_kb=target_kb,
        )
    finally:
        sem.release()


@router.post("/merge", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def merge(
    request: Request,
    files: list[UploadFile] = File(...),
) -> FileResult:
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="At least 2 files are required")
    if len(files) > settings.max_batch_files:
        raise HTTPException(status_code=413, detail="Too many files")

    sem = await acquire_task_slot(request)
    try:
        payload: list[tuple[str, bytes]] = []
        total = 0
        max_total = settings.max_batch_total_mb * 1024 * 1024
        for file in files:
            data = await file.read()
            if len(data) > _max_pdf_bytes():
                raise HTTPException(status_code=413, detail="File too large")
            validate_pdf_bytes(data)
            total += len(data)
            if total > max_total:
                raise HTTPException(status_code=413, detail="Batch too large")
            payload.append((file.filename or "document.pdf", data))
        return await PdfService().merge(pdf_files=payload)
    finally:
        sem.release()


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
    sem = await acquire_task_slot(request)
    try:
        file, data = validated
        parsed_pages = _parse_int_list(pages, "pages")
        parsed_order = _parse_int_list(order, "order")
        return await PdfService().pages(
            pdf_bytes=data,
            filename=file.filename or "document.pdf",
            operation=operation,
            pages=parsed_pages,
            order=parsed_order,
            rotation=rotation,
        )
    finally:
        sem.release()


@router.post("/split", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def split(
    request: Request,
    validated: tuple[UploadFile, bytes] = Depends(validate_pdf_upload),
    ranges: str = Form(...),
) -> FileResult:
    sem = await acquire_task_slot(request)
    try:
        file, data = validated
        return await PdfService().split(
            pdf_bytes=data,
            filename=file.filename or "document.pdf",
            ranges=ranges,
        )
    finally:
        sem.release()


@router.post("/from-images", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def from_images(
    request: Request,
    files: list[UploadFile] = File(...),
    dpi: int = Form(150),
) -> FileResult:
    if len(files) == 0:
        raise HTTPException(status_code=400, detail="At least 1 file is required")
    if len(files) > settings.max_batch_files:
        raise HTTPException(status_code=413, detail="Too many files")

    sem = await acquire_task_slot(request)
    try:
        payload: list[tuple[str, bytes]] = []
        total = 0
        max_total = settings.max_batch_total_mb * 1024 * 1024
        for file in files:
            data = await file.read()
            if len(data) > _max_image_bytes():
                raise HTTPException(status_code=413, detail="File too large")
            validate_image_bytes(data)
            total += len(data)
            if total > max_total:
                raise HTTPException(status_code=413, detail="Batch too large")
            payload.append((file.filename or "image", data))

        return await PdfService().from_images(image_files=payload, dpi=dpi)
    finally:
        sem.release()
