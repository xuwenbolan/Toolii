"""Shared FileResult construction logic for image and PDF services."""

from __future__ import annotations

from app.core.async_utils import run_sync
from app.core.config import settings
from app.processing.watermark import apply_watermark
from app.schemas.image import FileResult as ImageFileResult
from app.schemas.pdf import FileResult as PdfFileResult
from app.services.file_service import FileService, StoredFile, build_download_url


class FileResultBuilder:
    """Builds FileResult objects with consistent free/gated logic."""

    def __init__(
        self,
        files: FileService,
        *,
        owner_user_id: int | None = None,
    ) -> None:
        self._files = files
        self._owner_user_id = owner_user_id

    def build_free(
        self,
        stored_file_id: str,
        stored_size: int,
        *,
        filename: str,
        content_type: str,
        result_class: type = ImageFileResult,
    ):
        return result_class(
            file_id=stored_file_id,
            filename=filename,
            size=stored_size,
            content_type=content_type,
            download_url=build_download_url(file_id=stored_file_id, filename=filename),
            expires_in=settings.download_url_ttl,
        )

    async def build_gated_image(
        self,
        clean_file_id: str,
        clean_size: int,
        *,
        filename: str,
        content_type: str,
        credit_cost: int,
    ) -> ImageFileResult:
        """Save a watermarked preview and return a gated ImageFileResult."""

        def _build_watermarked() -> StoredFile:
            clean_path = self._files.get_path(clean_file_id)
            clean_data = clean_path.read_bytes()
            wm_data = apply_watermark(clean_data, content_type)
            return self._files.save_bytes(wm_data)

        wm_stored = await run_sync(_build_watermarked)
        meta = self._build_meta(clean_file_id=clean_file_id, credit_cost=credit_cost)

        return ImageFileResult(
            file_id=wm_stored.file_id,
            filename=filename,
            size=clean_size,
            content_type=content_type,
            download_url="",
            preview_url=build_download_url(file_id=wm_stored.file_id, filename=filename),
            requires_credit=True,
            credit_cost=credit_cost,
            expires_in=settings.download_url_ttl,
            meta=meta,
        )

    def build_gated_pdf(
        self,
        file_id: str,
        size: int,
        *,
        filename: str,
        content_type: str,
        credit_cost: int,
    ) -> PdfFileResult:
        """Return a gated result (no watermark for PDFs)."""
        meta = self._build_meta(credit_cost=credit_cost)

        return PdfFileResult(
            file_id=file_id,
            filename=filename,
            size=size,
            content_type=content_type,
            download_url="",
            requires_credit=True,
            credit_cost=credit_cost,
            expires_in=settings.download_url_ttl,
            meta=meta,
        )

    def _build_meta(
        self,
        *,
        clean_file_id: str | None = None,
        credit_cost: int,
    ) -> dict:
        meta: dict = {"credit_cost": credit_cost}
        if clean_file_id is not None:
            meta["clean_file_id"] = clean_file_id
        if self._owner_user_id is not None:
            meta["owner_user_id"] = self._owner_user_id
        return meta
