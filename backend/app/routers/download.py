from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit_log import audit
from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.exceptions import AppError
from app.core.security import verify_download_signature
from app.models.user import User
from app.services.credit_service import CreditService
from app.services.file_service import FileService

router = APIRouter(prefix=f"{settings.api_prefix}/download", tags=["download"])


@router.get("/{file_id}")
async def download(
    file_id: str,
    fn: str = Query(..., alias="fn"),
    exp: int = Query(..., alias="exp"),
    sig: str = Query(..., alias="sig"),
) -> FileResponse:
    now = int(time.time())
    if exp < now:
        raise HTTPException(status_code=410, detail="Expired")

    if not verify_download_signature(file_id=file_id, filename=fn, exp=exp, sig=sig):
        raise HTTPException(status_code=403, detail="Invalid signature")

    try:
        stored = FileService().get(file_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Not found") from exc

    return FileResponse(
        stored.path,
        media_type=stored.content_type,
        filename=fn,
        headers={"Cache-Control": "private, max-age=0"},
    )


class UnlockResult(BaseModel):
    download_url: str


@router.post("/{file_id}/unlock", response_model=UnlockResult)
async def unlock(
    request: Request,
    file_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UnlockResult:
    """Pay credits to unlock a gated file and receive a clean download URL.

    Two modes:
    1. Image tools: *file_id* is the watermarked preview whose metadata
       contains ``clean_file_id`` pointing to the unwatermarked original.
    2. PDF / non-image tools: *file_id* is the result file itself (no
       watermark).  Metadata has ``credit_cost`` but no ``clean_file_id``.
    """
    files = FileService()

    try:
        meta = files.get_meta(file_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="File not found") from exc

    clean_file_id = meta.get("clean_file_id")
    credit_cost = int(meta.get("credit_cost", 0))

    if not clean_file_id and credit_cost <= 0:
        raise AppError(
            code="NOT_GATED",
            message="This file does not require unlocking",
            status_code=400,
        )

    # Determine the target file to serve
    target_file_id = clean_file_id or file_id

    try:
        target_stored = files.get(target_file_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=410, detail="File expired") from exc

    if credit_cost <= 0:
        credit_cost = 1

    # Charge credits (idempotent via reference_id)
    ref_id = f"unlock:{target_file_id}"
    credit_svc = CreditService(db)
    charged = False
    if not await credit_svc.has_transaction(user_id=user.id, reference_id=ref_id):
        await credit_svc.consume(
            user_id=user.id,
            amount=credit_cost,
            tx_type="tool_use",
            description=f"Unlock file {target_file_id[:8]}",
            reference_id=ref_id,
        )
        charged = True

    if charged:
        await audit(
            category="credit",
            action="unlock",
            user_id=user.id,
            resource_type="file",
            resource_id=target_file_id,
            ip=get_remote_address(request),
            detail={"credit_cost": credit_cost},
        )

    download_url = files.build_download_url(
        file_id=target_file_id,
        filename=target_stored.original_filename,
    )
    return UnlockResult(download_url=download_url)
