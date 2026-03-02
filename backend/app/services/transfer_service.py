from __future__ import annotations

import hmac
import io
import logging
import secrets
import string
import zipfile
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.exceptions import AppError, ForbiddenError, NotFoundError
from app.models.file_transfer import FileTransfer, TransferFile, TransferStatus
from app.services.file_service import FileService
from app.utils.time_utils import utcnow

logger = logging.getLogger(__name__)

_TOKEN_CHARS = string.ascii_letters + string.digits
_TOKEN_LENGTH = 8
_MAX_CODE_ATTEMPTS = 10

RETENTION_MAP: dict[str, timedelta] = {
    "1h": timedelta(hours=1),
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
}


def _generate_token() -> str:
    return "".join(secrets.choice(_TOKEN_CHARS) for _ in range(_TOKEN_LENGTH))


def _generate_extract_code() -> str:
    return "".join(secrets.choice(string.digits) for _ in range(4))


@dataclass(slots=True)
class TransferCreateResult:
    transfer: FileTransfer
    transfer_path: str


@dataclass(slots=True)
class SingleDownloadResult:
    path: str
    filename: str
    content_type: str
    burn_after_read: bool
    transfer_id: int


@dataclass(slots=True)
class ZipDownloadResult:
    data: bytes
    filename: str
    burn_after_read: bool
    transfer_id: int


class TransferService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._files = FileService(storage_dir=settings.transfer_storage_dir)

    async def _unique_token(self) -> str:
        for _ in range(8):
            token = _generate_token()
            result = await self._db.execute(
                select(FileTransfer.id).where(FileTransfer.token == token)
            )
            if result.scalar_one_or_none() is None:
                return token
        raise AppError(
            code="TOKEN_GENERATE_FAILED",
            message="Failed to generate transfer token",
            status_code=500,
        )

    async def create(
        self,
        *,
        user_id: int,
        file_data_list: list[tuple[bytes, str, str]],
        retention: str,
        use_extract_code: bool = False,
        max_downloads: int | None = None,
        message: str | None = None,
        burn_after_read: bool = False,
    ) -> TransferCreateResult:
        if retention not in RETENTION_MAP:
            raise AppError(
                code="INVALID_RETENTION",
                message="Invalid retention period",
                status_code=400,
            )
        if not file_data_list:
            raise AppError(
                code="NO_FILES",
                message="At least one file is required",
                status_code=400,
            )
        if len(file_data_list) > settings.max_transfer_files:
            raise AppError(
                code="TOO_MANY_FILES",
                message=f"Maximum {settings.max_transfer_files} files",
                status_code=400,
            )
        if burn_after_read and len(file_data_list) > 1:
            raise AppError(
                code="BURN_SINGLE_FILE_ONLY",
                message="Burn after read only supports single file",
                status_code=400,
            )
        if max_downloads is not None and max_downloads < 1:
            raise AppError(
                code="INVALID_MAX_DOWNLOADS",
                message="Max downloads must be at least 1",
                status_code=400,
            )

        total_size = sum(len(d) for d, _, _ in file_data_list)
        max_total = settings.max_transfer_total_mb * 1024 * 1024
        if total_size > max_total:
            raise AppError(
                code="TOTAL_TOO_LARGE",
                message="Total file size exceeds limit",
                status_code=413,
            )

        try:
            token = await self._unique_token()
            now = utcnow()

            extract_code = _generate_extract_code() if use_extract_code else None

            transfer = FileTransfer(
                token=token,
                user_id=user_id,
                extract_code=extract_code,
                expires_at=now + RETENTION_MAP[retention],
                max_downloads=1 if burn_after_read else max_downloads,
                burn_after_read=burn_after_read,
                status=TransferStatus.ACTIVE,
                total_size=total_size,
                file_count=len(file_data_list),
                message=message[:500] if message else None,
            )
            self._db.add(transfer)
            await self._db.flush()

            transfer_files = []
            for data, filename, content_type in file_data_list:
                stored = self._files.save_bytes(
                    data=data, filename=filename, content_type=content_type
                )
                transfer_files.append(TransferFile(
                    transfer_id=transfer.id,
                    file_id=stored.file_id,
                    original_filename=stored.original_filename,
                    size=stored.size,
                    content_type=stored.content_type,
                ))
            self._db.add_all(transfer_files)

            await self._db.commit()
            return TransferCreateResult(
                transfer=transfer,
                transfer_path=f"/t/{token}",
            )
        except AppError:
            await self._db.rollback()
            raise
        except SQLAlchemyError as exc:
            await self._db.rollback()
            logger.exception("Transfer creation failed for user %s", user_id)
            raise AppError(
                code="TRANSFER_CREATE_FAILED",
                message="Failed to create transfer",
                status_code=500,
            ) from exc

    async def create_from_existing_file(
        self,
        *,
        user_id: int,
        file_id: str,
        retention: str,
        burn_after_read: bool = False,
    ) -> TransferCreateResult:
        """Create a transfer from an existing tool result file.

        Security note: file_id is a UUID4 hex (128-bit entropy), effectively
        unguessable. Tool result files expire within 24h. The file_id is only
        known to whoever triggered the tool processing (via signed download URL).
        """
        if retention not in RETENTION_MAP:
            raise AppError(
                code="INVALID_RETENTION",
                message="Invalid retention period",
                status_code=400,
            )

        # Read from default file storage (tool results)
        default_fs = FileService()
        try:
            stored = default_fs.get(file_id)
        except FileNotFoundError as exc:
            raise NotFoundError("Source file not found or expired") from exc

        # Copy to transfer storage
        data = stored.path.read_bytes()
        transfer_stored = self._files.save_bytes(
            data=data,
            filename=stored.original_filename,
            content_type=stored.content_type,
        )

        try:
            token = await self._unique_token()
            now = utcnow()

            transfer = FileTransfer(
                token=token,
                user_id=user_id,
                expires_at=now + RETENTION_MAP[retention],
                max_downloads=1 if burn_after_read else None,
                burn_after_read=burn_after_read,
                status=TransferStatus.ACTIVE,
                total_size=transfer_stored.size,
                file_count=1,
            )
            self._db.add(transfer)
            await self._db.flush()

            tf = TransferFile(
                transfer_id=transfer.id,
                file_id=transfer_stored.file_id,
                original_filename=transfer_stored.original_filename,
                size=transfer_stored.size,
                content_type=transfer_stored.content_type,
            )
            self._db.add(tf)
            await self._db.commit()

            return TransferCreateResult(
                transfer=transfer,
                transfer_path=f"/t/{token}",
            )
        except AppError:
            await self._db.rollback()
            raise
        except SQLAlchemyError as exc:
            await self._db.rollback()
            logger.exception("Transfer from result failed for user %s", user_id)
            raise AppError(
                code="TRANSFER_CREATE_FAILED",
                message="Failed to create transfer",
                status_code=500,
            ) from exc

    async def get_info(self, *, token: str) -> FileTransfer:
        result = await self._db.execute(
            select(FileTransfer)
            .options(selectinload(FileTransfer.files))
            .where(FileTransfer.token == token)
        )
        transfer = result.scalar_one_or_none()
        if transfer is None:
            raise NotFoundError("Transfer not found")
        return transfer

    async def check_extract_code(
        self, transfer: FileTransfer, *, extract_code: str | None
    ) -> None:
        """Verify extract code. Raises 403/429 on failure."""
        if not transfer.extract_code:
            return
        if transfer.failed_code_attempts >= _MAX_CODE_ATTEMPTS:
            raise AppError(
                code="EXTRACT_CODE_LOCKED",
                message="Too many failed attempts. Transfer locked.",
                status_code=429,
            )
        if not extract_code or not hmac.compare_digest(
            extract_code.encode(), transfer.extract_code.encode()
        ):
            await self._db.execute(
                update(FileTransfer)
                .where(FileTransfer.id == transfer.id)
                .values(
                    failed_code_attempts=FileTransfer.failed_code_attempts + 1
                )
            )
            await self._db.commit()
            raise AppError(
                code="INVALID_EXTRACT_CODE",
                message="Invalid or missing extract code",
                status_code=403,
            )

    async def check_access(
        self, transfer: FileTransfer, *, extract_code: str | None
    ) -> None:
        if transfer.status != TransferStatus.ACTIVE:
            raise AppError(
                code="TRANSFER_NOT_ACTIVE",
                message="This transfer is no longer active",
                status_code=410,
            )

        now = utcnow()
        exp = transfer.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp <= now:
            raise AppError(
                code="TRANSFER_EXPIRED",
                message="This transfer has expired",
                status_code=410,
            )

        if transfer.max_downloads and transfer.download_count >= transfer.max_downloads:
            raise AppError(
                code="TRANSFER_DOWNLOAD_LIMIT",
                message="Download limit reached",
                status_code=410,
            )

        await self.check_extract_code(transfer, extract_code=extract_code)

    async def _atomic_increment_download(self, transfer_id: int) -> None:
        """Atomically increment download_count, respecting max_downloads."""
        from sqlalchemy import or_

        result = await self._db.execute(
            update(FileTransfer)
            .where(
                FileTransfer.id == transfer_id,
                or_(
                    FileTransfer.max_downloads.is_(None),
                    FileTransfer.download_count < FileTransfer.max_downloads,
                ),
            )
            .values(download_count=FileTransfer.download_count + 1)
        )
        if result.rowcount == 0:
            raise AppError(
                code="TRANSFER_DOWNLOAD_LIMIT",
                message="Download limit reached",
                status_code=410,
            )
        await self._db.commit()

    async def download_single(
        self, *, token: str, file_id: int, extract_code: str | None,
    ) -> SingleDownloadResult:
        transfer = await self.get_info(token=token)
        await self.check_access(transfer, extract_code=extract_code)

        target = None
        for f in transfer.files:
            if f.id == file_id:
                target = f
                break
        if target is None:
            raise NotFoundError("File not found in transfer")

        stored = self._files.get(target.file_id)
        await self._atomic_increment_download(transfer.id)

        return SingleDownloadResult(
            path=str(stored.path),
            filename=target.original_filename,
            content_type=target.content_type,
            burn_after_read=transfer.burn_after_read,
            transfer_id=transfer.id,
        )

    async def download_zip(
        self, *, token: str, extract_code: str | None
    ) -> ZipDownloadResult:
        transfer = await self.get_info(token=token)
        await self.check_access(transfer, extract_code=extract_code)

        if transfer.burn_after_read:
            raise AppError(
                code="BURN_NO_ZIP",
                message="Zip download not available for burn-after-read transfers",
                status_code=400,
            )

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            seen_names: dict[str, int] = {}
            for f in transfer.files:
                stored = self._files.get(f.file_id)
                name = f.original_filename
                if name in seen_names:
                    seen_names[name] += 1
                    stem, dot, ext = name.rpartition(".")
                    if dot:
                        name = f"{stem}_{seen_names[name]}.{ext}"
                    else:
                        name = f"{name}_{seen_names[name]}"
                else:
                    seen_names[name] = 0
                zf.writestr(name, stored.path.read_bytes())

        await self._atomic_increment_download(transfer.id)

        return ZipDownloadResult(
            data=buf.getvalue(),
            filename=f"transfer-{token}.zip",
            burn_after_read=transfer.burn_after_read,
            transfer_id=transfer.id,
        )

    @staticmethod
    async def burn_transfer_bg(transfer_id: int) -> None:
        """Delete physical files and mark as burned. Runs as a BackgroundTask."""
        from app.core.database import SessionLocal

        fs = FileService(storage_dir=settings.transfer_storage_dir)
        async with SessionLocal() as db:
            result = await db.execute(
                select(FileTransfer)
                .options(selectinload(FileTransfer.files))
                .where(FileTransfer.id == transfer_id)
            )
            transfer = result.scalar_one_or_none()
            if transfer is None or transfer.status != TransferStatus.ACTIVE:
                return

            for f in transfer.files:
                fs.delete(f.file_id)

            transfer.status = TransferStatus.BURNED
            await db.commit()
            logger.info("Burned transfer %d", transfer_id)

    async def list_my_transfers(
        self, *, user_id: int, limit: int = 50, offset: int = 0
    ) -> tuple[list[FileTransfer], int]:
        limit = max(1, min(100, limit))
        offset = max(0, offset)

        total_result = await self._db.execute(
            select(func.count())
            .select_from(FileTransfer)
            .where(FileTransfer.user_id == user_id)
        )
        total = int(total_result.scalar_one() or 0)

        items_result = await self._db.execute(
            select(FileTransfer)
            .where(FileTransfer.user_id == user_id)
            .order_by(FileTransfer.id.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(items_result.scalars().all()), total

    async def delete_transfer(
        self, *, transfer_id: int, user_id: int
    ) -> None:
        result = await self._db.execute(
            select(FileTransfer)
            .options(selectinload(FileTransfer.files))
            .where(FileTransfer.id == transfer_id)
        )
        transfer = result.scalar_one_or_none()
        if transfer is None:
            raise NotFoundError("Transfer not found")
        if transfer.user_id != user_id:
            raise ForbiddenError("Not authorized to delete this transfer")

        for f in transfer.files:
            self._files.delete(f.file_id)

        await self._db.delete(transfer)
        await self._db.commit()

    async def expire_transfers(self, *, limit: int = 500) -> int:
        """Mark expired transfers and delete their physical files."""
        now = utcnow()
        result = await self._db.execute(
            select(FileTransfer)
            .options(selectinload(FileTransfer.files))
            .where(
                FileTransfer.status == TransferStatus.ACTIVE,
                FileTransfer.expires_at <= now,
            )
            .limit(limit)
        )
        transfers = list(result.scalars().all())
        count = 0
        for t in transfers:
            t.status = TransferStatus.EXPIRED
            for f in t.files:
                self._files.delete(f.file_id)
            count += 1
        if count > 0:
            await self._db.commit()
            logger.info("Expired %d transfers", count)
        return count
