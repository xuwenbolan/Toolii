from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.background import BackgroundTask

from slowapi.util import get_remote_address

from app.core.audit_log import audit
from app.core.config import settings
from app.core.dependencies import get_current_user, get_db, get_verified_user
from app.core.rate_limiter import dynamic_rate_limit, limiter
from app.core.transfer_validation import validate_transfer_file
from app.models.user import User
from app.schemas.transfer import (
    TransferCreateResponse,
    TransferFileItem,
    TransferInfoResponse,
    TransferListResponse,
    TransferMyItem,
)
from app.services.transfer_service import TransferService

router = APIRouter(prefix=f"{settings.api_prefix}/transfer", tags=["transfer"])


@router.post("/create", response_model=TransferCreateResponse)
@limiter.limit(dynamic_rate_limit)
async def create_transfer(
    request: Request,
    files: list[UploadFile] = File(...),
    retention: str = Form("24h"),
    use_extract_code: bool = Form(False),
    max_downloads: int | None = Form(None),
    message: str | None = Form(None, max_length=500),
    burn_after_read: bool = Form(False),
    user: User = Depends(get_verified_user),
    db: AsyncSession = Depends(get_db),
) -> TransferCreateResponse:
    max_file_bytes = settings.max_transfer_file_mb * 1024 * 1024

    file_data_list: list[tuple[bytes, str, str]] = []
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
        file_data_list.append((data, filename, content_type))

    service = TransferService(db)
    result = await service.create(
        user_id=user.id,
        file_data_list=file_data_list,
        retention=retention,
        use_extract_code=use_extract_code,
        max_downloads=max_downloads,
        message=message,
        burn_after_read=burn_after_read,
    )
    await audit(
        category="transfer",
        action="create",
        user_id=user.id,
        ip=get_remote_address(request),
        detail={
            "token": result.transfer.token,
            "file_count": result.transfer.file_count,
            "total_size": result.transfer.total_size,
        },
    )
    return TransferCreateResponse(
        token=result.transfer.token,
        transfer_path=result.transfer_path,
        expires_at=result.transfer.expires_at,
        file_count=result.transfer.file_count,
        total_size=result.transfer.total_size,
        burn_after_read=result.transfer.burn_after_read,
        extract_code=result.transfer.extract_code,
    )


@router.post("/create-from-result", response_model=TransferCreateResponse)
@limiter.limit(dynamic_rate_limit)
async def create_from_result(
    request: Request,
    file_id: str = Form(...),
    retention: str = Form("24h"),
    burn_after_read: bool = Form(False),
    user: User = Depends(get_verified_user),
    db: AsyncSession = Depends(get_db),
) -> TransferCreateResponse:
    """Create a transfer from an existing tool result file."""
    service = TransferService(db)
    result = await service.create_from_existing_file(
        user_id=user.id,
        file_id=file_id,
        retention=retention,
        burn_after_read=burn_after_read,
    )
    await audit(
        category="transfer",
        action="create_from_result",
        user_id=user.id,
        ip=get_remote_address(request),
        detail={
            "token": result.transfer.token,
            "source_file_id": file_id,
            "total_size": result.transfer.total_size,
        },
    )
    return TransferCreateResponse(
        token=result.transfer.token,
        transfer_path=result.transfer_path,
        expires_at=result.transfer.expires_at,
        file_count=1,
        total_size=result.transfer.total_size,
        burn_after_read=result.transfer.burn_after_read,
    )


@router.get("/info/{token}", response_model=TransferInfoResponse)
@limiter.limit("30/minute")
async def transfer_info(
    token: str,
    request: Request,  # noqa: ARG001
    code: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> TransferInfoResponse:
    service = TransferService(db)
    transfer = await service.get_info(token=token)

    # Only reveal file list and message after extract code is verified
    code_required = transfer.extract_code is not None
    code_verified = not code_required

    if code_required and code is not None:
        await service.check_extract_code(transfer, extract_code=code)
        code_verified = True

    files = [
        TransferFileItem(
            id=f.id,
            original_filename=f.original_filename,
            size=f.size,
            content_type=f.content_type,
        )
        for f in transfer.files
    ] if code_verified else []

    return TransferInfoResponse(
        token=transfer.token,
        message=transfer.message if code_verified else None,
        expires_at=transfer.expires_at,
        file_count=transfer.file_count,
        total_size=transfer.total_size,
        has_extract_code=code_required,
        download_count=transfer.download_count,
        max_downloads=transfer.max_downloads,
        burn_after_read=transfer.burn_after_read,
        status=transfer.status,
        files=files,
        created_at=transfer.created_at,
    )


@router.get("/download/{token}/{file_id}")
@limiter.limit("30/minute")
async def download_single_file(
    token: str,
    file_id: int,
    request: Request,  # noqa: ARG001
    code: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> FileResponse:
    service = TransferService(db)
    result = await service.download_single(
        token=token,
        file_id=file_id,
        extract_code=code,
    )
    bg = BackgroundTask(TransferService.burn_transfer_bg, result.transfer_id) if result.burn_after_read else None
    return FileResponse(
        result.path,
        media_type=result.content_type,
        filename=result.filename,
        background=bg,
        headers={"Cache-Control": "private, max-age=0"},
    )


@router.get("/download-zip/{token}")
@limiter.limit("10/minute")
async def download_zip(
    token: str,
    request: Request,  # noqa: ARG001
    code: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> Response:
    service = TransferService(db)
    result = await service.download_zip(token=token, extract_code=code)
    bg = BackgroundTask(TransferService.burn_transfer_bg, result.transfer_id) if result.burn_after_read else None
    return Response(
        content=result.data,
        media_type="application/zip",
        background=bg,
        headers={
            "Content-Disposition": f'attachment; filename="{result.filename}"',
            "Cache-Control": "private, max-age=0",
        },
    )


@router.get("/my", response_model=TransferListResponse)
@limiter.limit(dynamic_rate_limit)
async def my_transfers(
    request: Request,  # noqa: ARG001
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> TransferListResponse:
    service = TransferService(db)
    items, total = await service.list_my_transfers(
        user_id=user.id, limit=limit, offset=offset
    )
    return TransferListResponse(
        items=[
            TransferMyItem(
                id=t.id,
                token=t.token,
                file_count=t.file_count,
                total_size=t.total_size,
                status=t.status,
                download_count=t.download_count,
                max_downloads=t.max_downloads,
                burn_after_read=t.burn_after_read,
                expires_at=t.expires_at,
                created_at=t.created_at,
            )
            for t in items
        ],
        total=total,
    )


@router.delete("/{transfer_id}")
@limiter.limit(dynamic_rate_limit)
async def delete_transfer(
    transfer_id: int,
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    await TransferService(db).delete_transfer(
        transfer_id=transfer_id, user_id=user.id
    )
    await audit(
        category="transfer",
        action="delete",
        user_id=user.id,
        resource_type="transfer",
        resource_id=transfer_id,
        ip=get_remote_address(request),
    )
    return {"code": "TRANSFER_DELETED", "message": "Transfer deleted"}
