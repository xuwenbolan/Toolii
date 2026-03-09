from __future__ import annotations

import io
import re
import zipfile

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import get_db, get_verified_user
from app.core.file_response import file_response
from app.core.rate_limiter import dynamic_rate_limit, limiter
from app.core.transfer_validation import validate_transfer_file
from app.models.user import User
from app.schemas.hub import (
    EditorImageUploadResponse,
    FileDeleteRequest,
    FileDeleteResponse,
    FileContentResponse,
    FileContentUpdateRequest,
    FileContentUpdateResponse,
    FileExtendRequest,
    FileExtendResponse,
    FileRenameRequest,
    FileRenameResponse,
    FileUploadResponse,
    QuickShareResponse,
    ShareGroupCreate,
    ShareGroupListResponse,
    ShareGroupResponse,
    ShareInfoResponse,
    ShareNeedCodeResponse,
    UserFileDetailResponse,
    UserFileItem,
    UserFileListResponse,
)
from app.services.hub_service import ALLOWED_IMAGE_TYPES, HubService, share_count_query

router = APIRouter(prefix=f"{settings.api_prefix}/hub", tags=["hub"])


def _file_to_item(uf, share_count: int = 0) -> dict:
    return {
        "id": uf.id,
        "file_name": uf.original_filename,
        "size": uf.size,
        "content_type": uf.content_type,
        "source": uf.source,
        "expires_at": uf.expires_at.isoformat() if uf.expires_at else None,
        "created_at": uf.created_at.isoformat(),
        "share_count": share_count,
    }


def _file_to_detail(uf) -> dict:
    return {
        "id": uf.id,
        "file_name": uf.original_filename,
        "size": uf.size,
        "content_type": uf.content_type,
        "source": uf.source,
        "expires_at": uf.expires_at.isoformat() if uf.expires_at else None,
        "created_at": uf.created_at.isoformat(),
        "updated_at": uf.updated_at.isoformat(),
    }


# ── Upload ───────────────────────────────────────────────────────────

@router.post("/upload", response_model=FileUploadResponse)
@limiter.limit("10/minute")
async def upload_files(
    request: Request,
    files: list[UploadFile] = File(...),
    retention_days: int = Form(3),
    user: User = Depends(get_verified_user),
    db: AsyncSession = Depends(get_db),
) -> FileUploadResponse:
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    max_file_bytes = settings.max_hub_file_mb * 1024 * 1024
    hub = HubService(db)
    items = []

    for f in files:
        data = await f.read()
        filename = f.filename or "file"
        content_type = f.content_type or "application/octet-stream"
        validate_transfer_file(
            filename=filename,
            content_type=content_type,
            size=len(data),
            max_file_bytes=max_file_bytes,
        )
        uf = await hub.save_upload(
            user_id=user.id,
            data=data,
            filename=filename,
            content_type=content_type,
            retention_days=retention_days,
        )
        items.append(_file_to_item(uf))

    await db.commit()
    return FileUploadResponse(files=items)


# ── File management ──────────────────────────────────────────────────

@router.get("/files", response_model=UserFileListResponse)
@limiter.limit("30/minute")
async def list_files(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    source: str | None = Query(None),
    user: User = Depends(get_verified_user),
    db: AsyncSession = Depends(get_db),
) -> UserFileListResponse:
    hub = HubService(db)
    files, total = await hub.list_files(user.id, page=page, page_size=page_size, source=source)
    usage = await hub.get_usage(user.id)

    # Batch-fetch share counts to avoid N+1 queries
    file_ids = [uf.id for uf in files]
    share_count_map: dict[int, int] = {}
    if file_ids:
        from sqlalchemy import func as sa_func, select
        from app.models.user_file import ShareGroup, ShareGroupFile, ShareGroupStatus
        sc_result = await db.execute(
            select(ShareGroupFile.user_file_id, sa_func.count())
            .join(ShareGroup, ShareGroupFile.share_group_id == ShareGroup.id)
            .where(
                ShareGroupFile.user_file_id.in_(file_ids),
                ShareGroup.status == ShareGroupStatus.ACTIVE,
            )
            .group_by(ShareGroupFile.user_file_id)
        )
        share_count_map = dict(sc_result.all())

    items = [_file_to_item(uf, share_count=share_count_map.get(uf.id, 0)) for uf in files]
    return UserFileListResponse(items=items, total=total, **usage)


@router.get("/files/{file_id}", response_model=UserFileDetailResponse)
@limiter.limit("30/minute")
async def get_file_detail(
    request: Request,
    file_id: int,
    user: User = Depends(get_verified_user),
    db: AsyncSession = Depends(get_db),
) -> UserFileDetailResponse:
    hub = HubService(db)
    uf = await hub.get_file_detail(file_id, user.id)
    return UserFileDetailResponse(**_file_to_detail(uf))


@router.get("/files/{file_id}/content", response_model=FileContentResponse)
@limiter.limit("30/minute")
async def get_file_content(
    request: Request,
    file_id: int,
    user: User = Depends(get_verified_user),
    db: AsyncSession = Depends(get_db),
) -> FileContentResponse:
    hub = HubService(db)
    content, updated_at = await hub.get_markdown_content(file_id, user.id)
    return FileContentResponse(content=content, updated_at=updated_at)


@router.put("/files/{file_id}/content", response_model=FileContentUpdateResponse)
@limiter.limit("30/minute")
async def save_file_content(
    request: Request,
    file_id: int,
    body: FileContentUpdateRequest,
    user: User = Depends(get_verified_user),
    db: AsyncSession = Depends(get_db),
) -> FileContentUpdateResponse:
    hub = HubService(db)
    uf = await hub.save_markdown_content(
        file_id,
        user.id,
        content=body.content,
        base_updated_at=body.base_updated_at,
    )
    await db.commit()
    return FileContentUpdateResponse(size=uf.size, updated_at=uf.updated_at.isoformat())


@router.post("/files/{file_id}/images", response_model=EditorImageUploadResponse)
@limiter.limit("20/minute")
async def upload_editor_image(
    request: Request,
    file_id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_verified_user),
    db: AsyncSession = Depends(get_db),
) -> EditorImageUploadResponse:
    content_type = file.content_type or ""
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Only PNG, JPEG, GIF, and WebP images are supported")

    data = await file.read()
    max_bytes = settings.max_editor_image_mb * 1024 * 1024
    if len(data) > max_bytes:
        raise HTTPException(status_code=413, detail=f"Image exceeds {settings.max_editor_image_mb} MB limit")

    hub = HubService(db)
    storage_id, url = await hub.upload_editor_image(
        file_id,
        user.id,
        filename=file.filename or "image",
        data=data,
        content_type=content_type,
    )
    await db.commit()
    return EditorImageUploadResponse(file_id=storage_id, url=url)


@router.get("/files/{file_id}/download")
@limiter.limit("30/minute")
async def download_own_file(
    request: Request,
    file_id: int,
    user: User = Depends(get_verified_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    hub = HubService(db)
    uf = await hub.get_file(file_id, user.id)
    path = hub.get_file_path(uf.file_id)
    return file_response(path, media_type=uf.content_type, filename=uf.original_filename)


@router.patch("/files/{file_id}", response_model=FileRenameResponse)
@limiter.limit("10/minute")
async def rename_file(
    request: Request,
    file_id: int,
    body: FileRenameRequest,
    user: User = Depends(get_verified_user),
    db: AsyncSession = Depends(get_db),
) -> FileRenameResponse:
    hub = HubService(db)
    uf = await hub.rename_file(file_id, user.id, body.file_name)
    await db.commit()
    return FileRenameResponse(id=uf.id, file_name=uf.original_filename)


@router.post("/files/{file_id}/extend", response_model=FileExtendResponse)
@limiter.limit("10/minute")
async def extend_file(
    request: Request,
    file_id: int,
    body: FileExtendRequest,
    user: User = Depends(get_verified_user),
    db: AsyncSession = Depends(get_db),
) -> FileExtendResponse:
    hub = HubService(db)
    uf = await hub.extend_file(file_id, user.id, body.days)
    await db.commit()
    return FileExtendResponse(id=uf.id, expires_at=uf.expires_at.isoformat() if uf.expires_at else None)


@router.delete("/files", response_model=FileDeleteResponse)
@limiter.limit("10/minute")
async def delete_files(
    request: Request,
    body: FileDeleteRequest,
    user: User = Depends(get_verified_user),
    db: AsyncSession = Depends(get_db),
) -> FileDeleteResponse:
    hub = HubService(db)
    count = await hub.delete_files(body.ids, user.id)
    await db.commit()
    return FileDeleteResponse(deleted=count)


# ── Editor image serving (public) ────────────────────────────────────

_IMAGE_FILE_ID_RE = re.compile(r"^[a-f0-9]{32}$")


@router.get("/images/{file_id}")
@limiter.limit("200/minute")
async def serve_editor_image(
    request: Request,
    file_id: str,
    db: AsyncSession = Depends(get_db),
) -> Response:
    if not _IMAGE_FILE_ID_RE.match(file_id):
        raise HTTPException(status_code=404, detail="Not found")

    hub = HubService(db)
    path, content_type = await hub.get_editor_image(file_id)
    return file_response(
        path,
        media_type=content_type,
        headers={
            "Cache-Control": "public, max-age=86400",
            "X-Content-Type-Options": "nosniff",
        },
    )


# ── Share groups ─────────────────────────────────────────────────────

@router.post("/shares", response_model=ShareGroupResponse)
@limiter.limit("10/minute")
async def create_share(
    request: Request,
    body: ShareGroupCreate,
    user: User = Depends(get_verified_user),
    db: AsyncSession = Depends(get_db),
) -> ShareGroupResponse:
    hub = HubService(db)
    sg = await hub.create_share_group(
        user_id=user.id,
        file_ids=body.file_ids,
        use_extract_code=body.use_extract_code,
        message=body.message,
    )
    file_count, total_size = await hub._share_group_stats(sg.id)
    await db.commit()
    return ShareGroupResponse(
        id=sg.id,
        token=sg.token,
        share_url=f"/t/{sg.token}",
        extract_code=sg.extract_code,
        message=sg.message,
        file_count=file_count,
        total_size=total_size,
        expires_at=sg.expires_at.isoformat() if sg.expires_at else None,
        created_at=sg.created_at.isoformat(),
    )


@router.get("/shares", response_model=ShareGroupListResponse)
@limiter.limit("30/minute")
async def list_shares(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_verified_user),
    db: AsyncSession = Depends(get_db),
) -> ShareGroupListResponse:
    hub = HubService(db)
    items, total = await hub.list_share_groups(user.id, page=page, page_size=page_size)
    return ShareGroupListResponse(items=items, total=total)


@router.delete("/shares/{share_id}")
@limiter.limit("10/minute")
async def delete_share(
    request: Request,
    share_id: int,
    user: User = Depends(get_verified_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    hub = HubService(db)
    await hub.delete_share_group(share_id, user.id)
    await db.commit()
    return {"ok": True}


# ── Quick Share ──────────────────────────────────────────────────────

@router.post("/quick-share", response_model=QuickShareResponse)
@limiter.limit("10/minute")
async def quick_share(
    request: Request,
    files: list[UploadFile] = File(...),
    retention_days: int = Form(3),
    use_extract_code: bool = Form(False),
    message: str | None = Form(None, max_length=500),
    user: User = Depends(get_verified_user),
    db: AsyncSession = Depends(get_db),
) -> QuickShareResponse:
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    max_file_bytes = settings.max_hub_file_mb * 1024 * 1024
    hub = HubService(db)
    file_items = []
    file_ids = []

    for f in files:
        data = await f.read()
        filename = f.filename or "file"
        content_type = f.content_type or "application/octet-stream"
        validate_transfer_file(
            filename=filename,
            content_type=content_type,
            size=len(data),
            max_file_bytes=max_file_bytes,
        )
        uf = await hub.save_upload(
            user_id=user.id,
            data=data,
            filename=filename,
            content_type=content_type,
            retention_days=retention_days,
        )
        file_items.append(_file_to_item(uf))
        file_ids.append(uf.id)

    sg = await hub.create_share_group(
        user_id=user.id,
        file_ids=file_ids,
        use_extract_code=use_extract_code,
        message=message,
    )
    file_count, total_size = await hub._share_group_stats(sg.id)
    await db.commit()

    return QuickShareResponse(
        files=file_items,
        share=ShareGroupResponse(
            id=sg.id,
            token=sg.token,
            share_url=f"/t/{sg.token}",
            extract_code=sg.extract_code,
            message=sg.message,
            file_count=file_count,
            total_size=total_size,
            expires_at=sg.expires_at.isoformat() if sg.expires_at else None,
            created_at=sg.created_at.isoformat(),
        ),
    )


# ── Share from existing file ──────────────────────────────────────────

@router.post("/share-file/{file_id}", response_model=ShareGroupResponse)
@limiter.limit("10/minute")
async def share_existing_file(
    request: Request,
    file_id: str,
    user: User = Depends(get_verified_user),
    db: AsyncSession = Depends(get_db),
) -> ShareGroupResponse:
    """Create a share group from an existing hub file (by storage file_id)."""
    hub = HubService(db)
    uf = await hub.get_by_file_id(file_id)
    if not uf or uf.user_id != user.id:
        raise HTTPException(status_code=404, detail="File not found")

    sg = await hub.create_share_group(
        user_id=user.id,
        file_ids=[uf.id],
        use_extract_code=False,
    )
    file_count, total_size = await hub._share_group_stats(sg.id)
    await db.commit()
    return ShareGroupResponse(
        id=sg.id,
        token=sg.token,
        share_url=f"/t/{sg.token}",
        extract_code=sg.extract_code,
        message=sg.message,
        file_count=file_count,
        total_size=total_size,
        expires_at=sg.expires_at.isoformat() if sg.expires_at else None,
        created_at=sg.created_at.isoformat(),
    )


# ── Public share access ──────────────────────────────────────────────

@router.get("/s/{token}/info")
@limiter.limit("30/minute")
async def share_info(
    request: Request,
    token: str,
    code: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> ShareInfoResponse | ShareNeedCodeResponse:
    hub = HubService(db)
    info = await hub.get_share_info(token, code)
    if info is None:
        raise HTTPException(status_code=404, detail="Share not found")
    if info.get("need_code"):
        return ShareNeedCodeResponse()
    return ShareInfoResponse(**info)


@router.get("/s/{token}/{file_id}/download")
@limiter.limit("30/minute")
async def share_download_file(
    request: Request,
    token: str,
    file_id: int,
    code: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> Response:
    hub = HubService(db)
    uf = await hub.get_share_file(token, file_id, code)
    if not uf:
        raise HTTPException(status_code=404, detail="File not found")
    await db.commit()
    path = hub.get_file_path(uf.file_id)
    return file_response(path, media_type=uf.content_type, filename=uf.original_filename)


@router.get("/s/{token}/{file_id}/content", response_model=FileContentResponse)
@limiter.limit("30/minute")
async def share_get_file_content(
    request: Request,
    token: str,
    file_id: int,
    code: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> FileContentResponse:
    hub = HubService(db)
    content = await hub.get_share_markdown_content(token, file_id, code)
    return FileContentResponse(content=content, updated_at=None)


@router.get("/s/{token}/download-zip")
@limiter.limit("10/minute")
async def share_download_zip(
    request: Request,
    token: str,
    code: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> Response:
    hub = HubService(db)
    files = await hub.get_share_files_for_zip(token, code)
    await db.commit()

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        seen: dict[str, int] = {}
        for uf in files:
            name = uf.original_filename
            if name in seen:
                seen[name] += 1
                stem, dot, ext = name.rpartition(".")
                if dot:
                    name = f"{stem}_{seen[name]}.{ext}"
                else:
                    name = f"{name}_{seen[name]}"
            else:
                seen[name] = 0
            path = hub.get_file_path(uf.file_id)
            zf.write(path, name)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="files.zip"'},
    )
