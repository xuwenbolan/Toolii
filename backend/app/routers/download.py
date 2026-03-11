from __future__ import annotations

import json
import logging
import time

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel
from slowapi.util import get_remote_address
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit_log import audit
from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.exceptions import AppError, ForbiddenError, NotFoundError
from app.core.file_response import file_response
from app.core.security import verify_download_signature
from app.models.user import User
from app.services.credit_service import CreditService
from app.services.file_service import FileService, build_download_url
from app.services.hub_service import HubService

logger = logging.getLogger(__name__)

router = APIRouter(prefix=f"{settings.api_prefix}/download", tags=["download"])


@router.get("/{file_id}")
async def download(
    file_id: str,
    fn: str = Query(..., alias="fn"),
    exp: int = Query(..., alias="exp"),
    sig: str = Query(..., alias="sig"),
) -> Response:
    now = int(time.time())
    if exp < now:
        raise AppError(code="LINK_EXPIRED", message="Download link expired", status_code=410)

    if not verify_download_signature(file_id=file_id, filename=fn, exp=exp, sig=sig):
        raise ForbiddenError("Invalid download signature")

    try:
        path = FileService().get_path(file_id)
    except FileNotFoundError as exc:
        raise NotFoundError("File not found") from exc

    return file_response(
        path,
        media_type="application/octet-stream",
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
    1. Image tools: *file_id* is the watermarked preview whose user_files.meta
       contains ``clean_file_id`` pointing to the unwatermarked original.
    2. PDF / non-image tools: *file_id* is the result file itself (no
       watermark).  Meta has ``credit_cost`` but no ``clean_file_id``.
    """
    hub = HubService(db)
    uf = await hub.get_by_file_id(file_id)
    if not uf:
        raise NotFoundError("File not found")

    meta: dict = {}
    if uf.meta:
        try:
            meta = json.loads(uf.meta)
        except (json.JSONDecodeError, ValueError):
            logger.warning("Malformed meta JSON for file %s", file_id)

    clean_file_id = meta.get("clean_file_id")
    credit_cost = int(meta.get("credit_cost", 0))

    if not clean_file_id and credit_cost <= 0:
        raise AppError(
            code="NOT_GATED",
            message="This file does not require unlocking",
            status_code=400,
        )

    # Verify ownership: only the user who created the file can unlock it
    owner_id = meta.get("owner_user_id")
    if owner_id is not None and owner_id != user.id:
        raise ForbiddenError("Not the file owner")

    # Determine the target file to serve
    target_file_id = clean_file_id or file_id

    fs = FileService()
    try:
        fs.get_path(target_file_id)
    except FileNotFoundError as exc:
        raise AppError(code="FILE_EXPIRED", message="File expired", status_code=410) from exc

    # Look up the target file for filename
    target_uf = await hub.get_by_file_id(target_file_id) if clean_file_id else uf
    target_filename = target_uf.original_filename if target_uf else "download"

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

    download_url = build_download_url(
        file_id=target_file_id,
        filename=target_filename,
    )
    return UnlockResult(download_url=download_url)
