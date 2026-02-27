from __future__ import annotations

import asyncio
import os
from functools import partial

from app.core.config import settings
from app.core.exceptions import AppError
from app.processing.pdf_compress import compress_pdf
from app.processing.pdf_from_images import images_to_pdf
from app.processing.pdf_merge import merge_pdfs
from app.processing.pdf_pages import edit_pdf_pages
from app.schemas.pdf import FileResult, PdfPagesOperation
from app.services.file_service import FileService


class PdfService:
    def __init__(self) -> None:
        self._files = FileService()

    def _to_result(self, stored, *, filename: str) -> FileResult:  # type: ignore[no-untyped-def]
        return FileResult(
            file_id=stored.file_id,
            filename=filename,
            size=stored.size,
            content_type=stored.content_type,
            download_url=self._files.build_download_url(file_id=stored.file_id, filename=filename),
            expires_in=settings.download_url_ttl_seconds,
        )

    @staticmethod
    def _safe_stem(filename: str, fallback: str) -> str:
        base = os.path.basename(filename or fallback)
        stem = os.path.splitext(base)[0].strip()
        return stem or fallback

    async def compress(self, *, pdf_bytes: bytes, filename: str, target_kb: int | None) -> FileResult:
        if target_kb is not None and target_kb <= 0:
            raise AppError(code="INVALID_TARGET_KB", message="target_kb 必须大于 0", status_code=400)

        loop = asyncio.get_running_loop()
        try:
            out = await loop.run_in_executor(
                None,
                partial(compress_pdf, pdf_bytes, target_kb=target_kb),
            )
        except Exception as exc:  # noqa: BLE001
            raise AppError(code="PDF_PROCESS_FAILED", message="PDF 压缩失败", status_code=400) from exc

        out_name = f"{self._safe_stem(filename, 'document')}-compressed.pdf"
        stored = self._files.save_bytes(data=out, filename=out_name, content_type="application/pdf")
        return self._to_result(stored, filename=out_name)

    async def merge(self, *, pdf_files: list[tuple[str, bytes]]) -> FileResult:
        if len(pdf_files) < 2:
            raise AppError(code="INVALID_FILES", message="至少需要 2 个 PDF 文件", status_code=400)

        loop = asyncio.get_running_loop()
        try:
            out = await loop.run_in_executor(None, partial(merge_pdfs, [data for _, data in pdf_files]))
        except Exception as exc:  # noqa: BLE001
            raise AppError(code="PDF_PROCESS_FAILED", message="PDF 合并失败", status_code=400) from exc

        out_name = "toolii-merged.pdf"
        stored = self._files.save_bytes(data=out, filename=out_name, content_type="application/pdf")
        return self._to_result(stored, filename=out_name)

    async def pages(
        self,
        *,
        pdf_bytes: bytes,
        filename: str,
        operation: PdfPagesOperation | str,
        pages: list[int] | None,
        order: list[int] | None,
        rotation: int,
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
        except Exception as exc:  # noqa: BLE001
            raise AppError(code="PDF_PROCESS_FAILED", message="PDF 页面处理失败", status_code=400) from exc

        out_name = f"{self._safe_stem(filename, 'document')}-{op_value}.pdf"
        stored = self._files.save_bytes(data=out, filename=out_name, content_type="application/pdf")
        return self._to_result(stored, filename=out_name)

    async def from_images(
        self,
        *,
        image_files: list[tuple[str, bytes]],
        dpi: int = 150,
    ) -> FileResult:
        if not image_files:
            raise AppError(code="INVALID_FILES", message="至少上传 1 张图片", status_code=400)
        if dpi < 72 or dpi > 600:
            raise AppError(code="INVALID_DPI", message="dpi 必须在 72-600 之间", status_code=400)

        loop = asyncio.get_running_loop()
        try:
            out = await loop.run_in_executor(
                None,
                partial(images_to_pdf, [data for _, data in image_files], dpi=dpi),
            )
        except Exception as exc:  # noqa: BLE001
            raise AppError(code="PDF_PROCESS_FAILED", message="图转 PDF 失败", status_code=400) from exc

        if len(image_files) == 1:
            out_name = f"{self._safe_stem(image_files[0][0], 'image')}.pdf"
        else:
            out_name = "toolii-images.pdf"

        stored = self._files.save_bytes(data=out, filename=out_name, content_type="application/pdf")
        return self._to_result(stored, filename=out_name)

