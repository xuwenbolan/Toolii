from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile

from app.core.config import settings
from app.core.dependencies import tool_credit_cost, tool_owner_user_id
from app.core.exceptions import AppError
from app.core.file_validation import validate_docx_bytes
from app.core.rate_limiter import dynamic_rate_limit, limiter
from app.core.task_limiter import task_slot
from app.core.tool_recording import ToolGatewayRoute
from app.core.upload_limits import max_docx_bytes
from app.schemas.common import FileResult
from app.schemas.docx import DocxAnalysisResult
from app.services.docx_service import DocxService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix=f"{settings.api_prefix}/docx",
    tags=["docx"],
    route_class=ToolGatewayRoute,
)


async def validate_docx_upload(file: UploadFile = File(...)) -> tuple[UploadFile, bytes]:
    data = await file.read()
    if len(data) > max_docx_bytes():
        raise AppError(code="FILE_TOO_LARGE", message="File too large", status_code=413)
    validate_docx_bytes(data)
    logger.debug("DOCX accepted: filename=%s size=%d", file.filename, len(data))
    return file, data


def _parse_issue_codes(raw: str | None) -> list[str] | None:
    """Parse a JSON string of issue codes. Returns None if empty."""
    if raw is None or raw.strip() == "":
        return None
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise AppError(code="INVALID_JSON", message="Invalid issues JSON") from exc
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise AppError(code="INVALID_JSON", message="issues must be a JSON array of strings")
    return value if value else None


def _parse_merge_issues(raw: str | None) -> dict[int, list[str]] | None:
    """Parse per-file issue map: {"0": ["CODE1"], "2": ["CODE2"]}."""
    if raw is None or raw.strip() == "":
        return None
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise AppError(code="INVALID_JSON", message="Invalid issues JSON") from exc
    if not isinstance(value, dict):
        raise AppError(code="INVALID_JSON", message="issues must be a JSON object {file_index: [codes]}")
    result: dict[int, list[str]] = {}
    for k, v in value.items():
        try:
            idx = int(k)
        except ValueError:
            raise AppError(code="INVALID_JSON", message="issues keys must be file indices")
        if not isinstance(v, list) or not all(isinstance(c, str) for c in v):
            raise AppError(code="INVALID_JSON", message="issues values must be arrays of strings")
        if v:
            result[idx] = v
    return result if result else None


@router.post("/analyze", response_model=DocxAnalysisResult)
@limiter.limit(dynamic_rate_limit)
async def analyze(
    request: Request,
    validated: tuple[UploadFile, bytes] = Depends(validate_docx_upload),
) -> DocxAnalysisResult:
    async with task_slot(request):
        _file, data = validated
        result_dict = await DocxService().analyze(docx_bytes=data)
        return DocxAnalysisResult(**result_dict)


@router.post("/convert", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def convert(
    request: Request,
    validated: tuple[UploadFile, bytes] = Depends(validate_docx_upload),
    issues: str | None = Form(None),
) -> FileResult:
    async with task_slot(request):
        file, data = validated
        issue_codes = _parse_issue_codes(issues)
        svc = DocxService(owner_user_id=tool_owner_user_id(request))
        filename = file.filename or "document.docx"
        credit_cost = tool_credit_cost(request)

        if issue_codes:
            return await svc.repair_and_convert(
                docx_bytes=data, filename=filename,
                issue_codes=issue_codes, credit_cost=credit_cost,
            )
        return await svc.convert_to_pdf(
            docx_bytes=data, filename=filename, credit_cost=credit_cost,
        )


@router.post("/repair", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def repair(
    request: Request,
    validated: tuple[UploadFile, bytes] = Depends(validate_docx_upload),
    issues: str = Form(...),
) -> FileResult:
    async with task_slot(request):
        file, data = validated
        issue_codes = _parse_issue_codes(issues)
        if not issue_codes:
            raise AppError(code="MISSING_ISSUES", message="At least one issue code is required")
        return await DocxService(
            owner_user_id=tool_owner_user_id(request),
        ).repair(
            docx_bytes=data,
            filename=file.filename or "document.docx",
            issue_codes=issue_codes,
            credit_cost=tool_credit_cost(request),
        )


@router.post("/merge", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def merge(
    request: Request,
    files: list[UploadFile] = File(...),
    output_format: str = Form("docx"),
    issues: str | None = Form(None),
) -> FileResult:
    if len(files) < 2:
        raise AppError(code="TOO_FEW_FILES", message="At least 2 files are required")
    if len(files) > settings.max_batch_files:
        raise AppError(code="TOO_MANY_FILES", message="Too many files", status_code=413)
    if output_format not in ("docx", "pdf"):
        raise AppError(code="INVALID_FORMAT", message="output_format must be 'docx' or 'pdf'")

    per_file_issues = _parse_merge_issues(issues)

    async with task_slot(request):
        payload: list[tuple[str, bytes]] = []
        total = 0
        max_total = settings.max_batch_total_mb * 1024 * 1024
        for file in files:
            data = await file.read()
            if len(data) > max_docx_bytes():
                raise AppError(code="FILE_TOO_LARGE", message="File too large", status_code=413)
            validate_docx_bytes(data)
            total += len(data)
            if total > max_total:
                raise AppError(code="BATCH_TOO_LARGE", message="Batch too large", status_code=413)
            payload.append((file.filename or "document.docx", data))

        return await DocxService(
            owner_user_id=tool_owner_user_id(request),
        ).merge(
            docx_files=payload,
            output_format=output_format,
            per_file_issues=per_file_issues,
            credit_cost=tool_credit_cost(request),
        )


@router.post("/split", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def split(
    request: Request,
    validated: tuple[UploadFile, bytes] = Depends(validate_docx_upload),
    split_level: int = Form(1),
) -> FileResult:
    if split_level < 1 or split_level > 6:
        raise AppError(code="INVALID_SPLIT_LEVEL", message="split_level must be 1-6")
    async with task_slot(request):
        file, data = validated
        return await DocxService(
            owner_user_id=tool_owner_user_id(request),
        ).split(
            docx_bytes=data,
            filename=file.filename or "document.docx",
            split_level=split_level,
            credit_cost=tool_credit_cost(request),
        )


@router.post("/compress", response_model=FileResult)
@limiter.limit(dynamic_rate_limit)
async def compress(
    request: Request,
    validated: tuple[UploadFile, bytes] = Depends(validate_docx_upload),
    image_quality: int = Form(75),
) -> FileResult:
    image_quality = max(30, min(95, image_quality))
    async with task_slot(request):
        file, data = validated
        return await DocxService(
            owner_user_id=tool_owner_user_id(request),
        ).compress(
            docx_bytes=data,
            filename=file.filename or "document.docx",
            image_quality=image_quality,
            credit_cost=tool_credit_cost(request),
        )
