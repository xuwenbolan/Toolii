from __future__ import annotations

import asyncio
import os
from functools import partial

from app.core.exceptions import AppError
from app.processing.pdf_compress import compress_pdf
from app.processing.pdf_from_images import images_to_pdf
from app.processing.pdf_merge import merge_pdfs
from app.processing.pdf_pages import edit_pdf_pages
from app.processing.pdf_split import split_pdf
from app.schemas.pdf import FileResult, PdfPagesOperation
from app.services.file_service import FileService, build_download_url

_DEFAULT_EXPIRES_IN = 24 * 3600


class PdfService:
    def __init__(self, *, owner_user_id: int | None = None) -> None:
        self._files = FileService()
        self._owner_user_id = owner_user_id

    def _to_result(
        self,
        stored_file_id: str,
        stored_size: int,
        *,
        filename: str,
        content_type: str = "application/pdf",
        credit_cost: int = 0,
    ) -> FileResult:
        if credit_cost > 0:
            return self._to_gated_result(
                stored_file_id, stored_size,
                filename=filename, content_type=content_type, credit_cost=credit_cost,
            )
        return FileResult(
            file_id=stored_file_id,
            filename=filename,
            size=stored_size,
            content_type=content_type,
            download_url=build_download_url(file_id=stored_file_id, filename=filename),
            expires_in=_DEFAULT_EXPIRES_IN,
        )

    def _to_gated_result(
        self,
        file_id: str,
        size: int,
        *,
        filename: str,
        content_type: str,
        credit_cost: int,
    ) -> FileResult:
        """Return a gated result (no download URL, pay to unlock).

        Unlike image tools there is no watermarked preview for PDFs.
        Credit gating metadata is stored in FileResult.meta for the router
        to persist in user_files.meta.
        """
        meta = {"credit_cost": credit_cost}
        if self._owner_user_id is not None:
            meta["owner_user_id"] = self._owner_user_id

        return FileResult(
            file_id=file_id,
            filename=filename,
            size=size,
            content_type=content_type,
            download_url="",
            requires_credit=True,
            credit_cost=credit_cost,
            expires_in=_DEFAULT_EXPIRES_IN,
            meta=meta,
        )

    @staticmethod
    def _safe_stem(filename: str, fallback: str) -> str:
        base = os.path.basename(filename or fallback)
        stem = os.path.splitext(base)[0].strip()
        return stem or fallback

    async def compress(self, *, pdf_bytes: bytes, filename: str, target_kb: int | None, credit_cost: int = 0) -> FileResult:
        if target_kb is not None and target_kb <= 0:
            raise AppError(code="INVALID_TARGET_KB", message="target_kb must be greater than 0", status_code=400)

        loop = asyncio.get_running_loop()
        try:
            out = await loop.run_in_executor(
                None,
                partial(compress_pdf, pdf_bytes, target_kb=target_kb),
            )
        except (OSError, ValueError, RuntimeError) as exc:
            raise AppError(code="PDF_PROCESS_FAILED", message="PDF compression failed", status_code=400) from exc

        out_name = f"{self._safe_stem(filename, 'document')}-compressed.pdf"
        stored = self._files.save_bytes(out)
        return self._to_result(stored.file_id, stored.size, filename=out_name, credit_cost=credit_cost)

    async def merge(self, *, pdf_files: list[tuple[str, bytes]], credit_cost: int = 0) -> FileResult:
        if len(pdf_files) < 2:
            raise AppError(code="INVALID_FILES", message="At least 2 PDF files required", status_code=400)

        loop = asyncio.get_running_loop()
        try:
            out = await loop.run_in_executor(None, partial(merge_pdfs, [data for _, data in pdf_files]))
        except (OSError, ValueError, RuntimeError) as exc:
            raise AppError(code="PDF_PROCESS_FAILED", message="PDF merge failed", status_code=400) from exc

        out_name = "toolii-merged.pdf"
        stored = self._files.save_bytes(out)
        return self._to_result(stored.file_id, stored.size, filename=out_name, credit_cost=credit_cost)

    async def pages(
        self,
        *,
        pdf_bytes: bytes,
        filename: str,
        operation: PdfPagesOperation | str,
        pages: list[int] | None,
        order: list[int] | None,
        rotation: int,
        credit_cost: int = 0,
    ) -> FileResult:
        op_value = operation.value if isinstance(operation, PdfPagesOperation) else str(operation)

        loop = asyncio.get_running_loop()
        try:
            out = await loop.run_in_executor(
                None,
                partial(
                    edit_pdf_pages,
                    pdf_bytes,
                    operation=op_value,  # type: ignore[arg-type]
                    pages=pages,
                    order=order,
                    rotation=rotation,
                ),
            )
        except (OSError, ValueError, RuntimeError) as exc:
            raise AppError(code="PDF_PROCESS_FAILED", message="PDF page processing failed", status_code=400) from exc

        out_name = f"{self._safe_stem(filename, 'document')}-{op_value}.pdf"
        stored = self._files.save_bytes(out)
        return self._to_result(stored.file_id, stored.size, filename=out_name, credit_cost=credit_cost)

    async def split(self, *, pdf_bytes: bytes, filename: str, ranges: str, credit_cost: int = 0) -> FileResult:
        ranges = ranges.strip()
        if not ranges:
            raise AppError(code="MISSING_RANGES", message="ranges cannot be empty", status_code=400)

        loop = asyncio.get_running_loop()
        try:
            zip_bytes = await loop.run_in_executor(
                None,
                partial(split_pdf, pdf_bytes, ranges=ranges),
            )
        except (OSError, ValueError, RuntimeError) as exc:
            raise AppError(code="PDF_PROCESS_FAILED", message=f"PDF split failed: {exc}", status_code=400) from exc

        out_name = f"{self._safe_stem(filename, 'document')}-split.zip"
        stored = self._files.save_bytes(zip_bytes)
        return self._to_result(stored.file_id, stored.size, filename=out_name, content_type="application/zip", credit_cost=credit_cost)

    async def from_images(
        self,
        *,
        image_files: list[tuple[str, bytes]],
        dpi: int = 150,
        credit_cost: int = 0,
    ) -> FileResult:
        if not image_files:
            raise AppError(code="INVALID_FILES", message="At least 1 image required", status_code=400)
        if dpi < 72 or dpi > 600:
            raise AppError(code="INVALID_DPI", message="dpi must be between 72 and 600", status_code=400)

        loop = asyncio.get_running_loop()
        try:
            out = await loop.run_in_executor(
                None,
                partial(images_to_pdf, [data for _, data in image_files], dpi=dpi),
            )
        except (OSError, ValueError, RuntimeError) as exc:
            raise AppError(code="PDF_PROCESS_FAILED", message="Images to PDF conversion failed", status_code=400) from exc

        if len(image_files) == 1:
            out_name = f"{self._safe_stem(image_files[0][0], 'image')}.pdf"
        else:
            out_name = "toolii-images.pdf"

        stored = self._files.save_bytes(out)
        return self._to_result(stored.file_id, stored.size, filename=out_name, credit_cost=credit_cost)
