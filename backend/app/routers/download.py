from __future__ import annotations

import time

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse

from app.core.config import settings
from app.core.security import verify_download_signature
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
