from __future__ import annotations

import hashlib
import io
import logging
import secrets
from datetime import timedelta
from pathlib import Path

from PIL import Image, ImageOps
from sqlalchemy import delete, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import AppError, NotFoundError
from app.models.facemap_share import FaceMapShare
from app.services.file_service import FileService
from app.utils.time_utils import utcnow

logger = logging.getLogger(__name__)

_MAX_SHARE_IMAGE_PX = 1600
_JPEG_QUALITY = 90


def _compress_image(image_bytes: bytes) -> bytes:
    """Compress image to JPEG, resized to max 1600px longest side."""
    img = Image.open(io.BytesIO(image_bytes))
    img = ImageOps.exif_transpose(img)
    img = img.convert("RGB")

    w, h = img.size
    if max(w, h) > _MAX_SHARE_IMAGE_PX:
        ratio = _MAX_SHARE_IMAGE_PX / max(w, h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=_JPEG_QUALITY, optimize=True)
    return buf.getvalue()


_COMPOSITE_FACE_SIZE = 400
_COMPOSITE_GAP = 20


def _create_side_by_side(img1_bytes: bytes, img2_bytes: bytes) -> bytes:
    """Create a side-by-side composite image from two face photos."""
    imgs = []
    for raw in (img1_bytes, img2_bytes):
        img = Image.open(io.BytesIO(raw))
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
        img = ImageOps.fit(img, (_COMPOSITE_FACE_SIZE, _COMPOSITE_FACE_SIZE), Image.LANCZOS)
        imgs.append(img)

    total_w = _COMPOSITE_FACE_SIZE * 2 + _COMPOSITE_GAP
    canvas = Image.new("RGB", (total_w, _COMPOSITE_FACE_SIZE), (245, 245, 245))
    canvas.paste(imgs[0], (0, 0))
    canvas.paste(imgs[1], (_COMPOSITE_FACE_SIZE + _COMPOSITE_GAP, 0))

    buf = io.BytesIO()
    canvas.save(buf, format="JPEG", quality=_JPEG_QUALITY, optimize=True)
    return buf.getvalue()


class FaceMapShareService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db
        self._files = FileService(storage_dir=settings.facemap_share_storage_dir)

    @staticmethod
    def _compute_hash(share_type: str, result_json: str) -> str:
        data = f"{share_type}:{result_json}"
        return hashlib.sha256(data.encode()).hexdigest()

    async def _find_by_hash(self, content_hash: str) -> FaceMapShare | None:
        """Return an existing non-expired share with the same content hash."""
        result = await self._db.execute(
            select(FaceMapShare).where(
                FaceMapShare.content_hash == content_hash,
                FaceMapShare.expires_at > utcnow(),
            )
        )
        return result.scalar_one_or_none()

    async def _generate_unique_token(self) -> str:
        for _ in range(8):
            token = secrets.token_urlsafe(18).replace("-", "").replace("_", "")[:24]
            result = await self._db.execute(
                select(FaceMapShare.id).where(FaceMapShare.token == token)
            )
            if result.scalar_one_or_none() is None:
                return token
        raise AppError(
            code="SHARE_TOKEN_GENERATE_FAILED",
            message="Failed to generate share token",
            status_code=500,
        )

    async def create_share(
        self,
        *,
        image_bytes: bytes,
        result_json: str,
        share_type: str,
        locale: str,
        user_id: int | None = None,
    ) -> FaceMapShare:
        content_hash = self._compute_hash(share_type, result_json)
        existing = await self._find_by_hash(content_hash)
        if existing:
            return existing

        compressed = _compress_image(image_bytes)
        stored = self._files.save_bytes(
            data=compressed,
            filename="share.jpg",
            content_type="image/jpeg",
        )

        token = await self._generate_unique_token()
        now = utcnow()
        share = FaceMapShare(
            token=token,
            result_json=result_json,
            image_file_id=stored.file_id,
            share_type=share_type,
            content_hash=content_hash,
            locale=locale,
            user_id=user_id,
            expires_at=now + timedelta(days=settings.facemap_share_ttl_days),
        )
        self._db.add(share)
        try:
            await self._db.commit()
            await self._db.refresh(share)
        except SQLAlchemyError as exc:
            await self._db.rollback()
            self._files.delete(stored.file_id)
            raise AppError(
                code="FACEMAP_SHARE_CREATE_FAILED",
                message="Failed to create share",
                status_code=500,
            ) from exc
        return share

    async def create_similarity_share(
        self,
        *,
        image1_bytes: bytes,
        image2_bytes: bytes,
        result_json: str,
        locale: str,
        user_id: int | None = None,
    ) -> FaceMapShare:
        """Create a share for face similarity with a side-by-side composite."""
        content_hash = self._compute_hash("similarity", result_json)
        existing = await self._find_by_hash(content_hash)
        if existing:
            return existing

        composite = _create_side_by_side(image1_bytes, image2_bytes)
        stored = self._files.save_bytes(
            data=composite,
            filename="share.jpg",
            content_type="image/jpeg",
        )

        token = await self._generate_unique_token()
        now = utcnow()
        share = FaceMapShare(
            token=token,
            result_json=result_json,
            image_file_id=stored.file_id,
            share_type="similarity",
            content_hash=content_hash,
            locale=locale,
            user_id=user_id,
            expires_at=now + timedelta(days=settings.facemap_share_ttl_days),
        )
        self._db.add(share)
        try:
            await self._db.commit()
            await self._db.refresh(share)
        except SQLAlchemyError as exc:
            await self._db.rollback()
            self._files.delete(stored.file_id)
            raise AppError(
                code="FACEMAP_SHARE_CREATE_FAILED",
                message="Failed to create share",
                status_code=500,
            ) from exc
        return share

    async def get_share(self, *, token: str) -> FaceMapShare:
        result = await self._db.execute(
            select(FaceMapShare).where(FaceMapShare.token == token)
        )
        share = result.scalar_one_or_none()
        if share is None:
            raise NotFoundError("Share not found")
        if share.expires_at.tzinfo is None:
            from datetime import timezone
            expires = share.expires_at.replace(tzinfo=timezone.utc)
        else:
            expires = share.expires_at
        if expires < utcnow():
            raise AppError(code="SHARE_EXPIRED", message="Share has expired", status_code=410)
        return share

    def get_image_path(self, *, file_id: str) -> Path:
        stored = self._files.get(file_id)
        return stored.path

    async def expire_shares(self, *, limit: int = 500) -> int:
        """Delete expired shares and their image files."""
        now = utcnow()
        try:
            result = await self._db.execute(
                select(FaceMapShare)
                .where(FaceMapShare.expires_at < now)
                .limit(limit)
            )
            shares = result.scalars().all()
            if not shares:
                return 0

            for share in shares:
                try:
                    self._files.delete(share.image_file_id)
                except Exception:
                    logger.warning(
                        "Failed to delete image for share %s", share.token
                    )

            share_ids = [s.id for s in shares]
            await self._db.execute(
                delete(FaceMapShare).where(FaceMapShare.id.in_(share_ids))
            )
            await self._db.commit()
            logger.info("Expired %d facemap shares", len(share_ids))
            return len(share_ids)
        except SQLAlchemyError:
            await self._db.rollback()
            logger.exception("Failed to expire facemap shares")
            return 0
