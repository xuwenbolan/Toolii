from __future__ import annotations

import os
import subprocess
from typing import Any

from app.core.async_utils import run_sync
from app.core.exceptions import AppError
from app.processing.docx_analyze import analyze_docx
from app.processing.docx_convert import convert_docx_to_pdf
from app.processing.docx_compress import compress_docx
from app.processing.docx_merge import merge_docx
from app.processing.docx_repair import repair_docx
from app.processing.docx_split import split_docx
from app.schemas.common import FileResult

_DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
from app.services.file_result_builder import FileResultBuilder
from app.services.file_service import FileService


class DocxService:
    def __init__(self, *, owner_user_id: int | None = None) -> None:
        self._files = FileService()
        self._result = FileResultBuilder(self._files, owner_user_id=owner_user_id)

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
            return self._result.build_gated_pdf(
                stored_file_id, stored_size,
                filename=filename, content_type=content_type, credit_cost=credit_cost,
            )
        return self._result.build_free(
            stored_file_id, stored_size,
            filename=filename, content_type=content_type,
            result_class=FileResult,
        )

    @staticmethod
    def _safe_stem(filename: str, fallback: str) -> str:
        base = os.path.basename(filename or fallback)
        stem = os.path.splitext(base)[0].strip()
        return stem or fallback

    async def analyze(self, *, docx_bytes: bytes) -> dict[str, Any]:
        """Run analysis and return result as a plain dict."""
        try:
            return await run_sync(analyze_docx, docx_bytes)
        except (OSError, ValueError, RuntimeError) as exc:
            raise AppError(
                code="DOCX_ANALYZE_FAILED",
                message=f"DOCX analysis failed: {exc}",
                status_code=400,
            ) from exc

    async def convert_to_pdf(
        self,
        *,
        docx_bytes: bytes,
        filename: str,
        credit_cost: int = 0,
    ) -> FileResult:
        """Convert DOCX to PDF via LibreOffice headless."""
        try:
            pdf_bytes = await run_sync(convert_docx_to_pdf, docx_bytes)
        except subprocess.TimeoutExpired as exc:
            raise AppError(
                code="DOCX_CONVERT_TIMEOUT",
                message="Conversion timed out — document may be too large",
                status_code=408,
            ) from exc
        except (OSError, RuntimeError) as exc:
            raise AppError(
                code="DOCX_CONVERT_FAILED",
                message=f"DOCX to PDF conversion failed: {exc}",
                status_code=400,
            ) from exc

        out_name = f"{self._safe_stem(filename, 'document')}.pdf"
        stored = self._files.save_bytes(pdf_bytes)
        return self._to_result(stored.file_id, stored.size, filename=out_name, credit_cost=credit_cost)

    async def repair(
        self,
        *,
        docx_bytes: bytes,
        filename: str,
        issue_codes: list[str],
        credit_cost: int = 0,
    ) -> FileResult:
        """Repair DOCX by applying selected fixes, return repaired DOCX."""
        try:
            repaired = await run_sync(repair_docx, docx_bytes, issue_codes)
        except (OSError, ValueError, RuntimeError) as exc:
            raise AppError(
                code="DOCX_REPAIR_FAILED",
                message=f"DOCX repair failed: {exc}",
                status_code=400,
            ) from exc

        out_name = f"{self._safe_stem(filename, 'document')}-repaired.docx"
        stored = self._files.save_bytes(repaired)
        return self._to_result(
            stored.file_id, stored.size,
            filename=out_name, content_type=_DOCX_CONTENT_TYPE, credit_cost=credit_cost,
        )

    async def repair_and_convert(
        self,
        *,
        docx_bytes: bytes,
        filename: str,
        issue_codes: list[str],
        credit_cost: int = 0,
    ) -> FileResult:
        """Repair DOCX then convert to PDF."""
        try:
            repaired = await run_sync(repair_docx, docx_bytes, issue_codes)
            pdf_bytes = await run_sync(convert_docx_to_pdf, repaired)
        except subprocess.TimeoutExpired as exc:
            raise AppError(
                code="DOCX_CONVERT_TIMEOUT",
                message="Conversion timed out — document may be too large",
                status_code=408,
            ) from exc
        except (OSError, ValueError, RuntimeError) as exc:
            raise AppError(
                code="DOCX_REPAIR_CONVERT_FAILED",
                message=f"Repair and convert failed: {exc}",
                status_code=400,
            ) from exc

        out_name = f"{self._safe_stem(filename, 'document')}.pdf"
        stored = self._files.save_bytes(pdf_bytes)
        return self._to_result(stored.file_id, stored.size, filename=out_name, credit_cost=credit_cost)

    async def merge(
        self,
        *,
        docx_files: list[tuple[str, bytes]],
        output_format: str = "docx",
        per_file_issues: dict[int, list[str]] | None = None,
        credit_cost: int = 0,
    ) -> FileResult:
        """Merge multiple DOCX files, optionally repairing each first."""
        try:
            file_bytes = []
            for i, (_name, data) in enumerate(docx_files):
                if per_file_issues and i in per_file_issues:
                    data = await run_sync(repair_docx, data, per_file_issues[i])
                file_bytes.append(data)

            merged = await run_sync(merge_docx, file_bytes)

            if output_format == "pdf":
                result_bytes = await run_sync(convert_docx_to_pdf, merged)
                out_name = "toolii-merged.pdf"
                content_type = "application/pdf"
            else:
                result_bytes = merged
                out_name = "toolii-merged.docx"
                content_type = _DOCX_CONTENT_TYPE
        except subprocess.TimeoutExpired as exc:
            raise AppError(
                code="DOCX_MERGE_TIMEOUT",
                message="Merge timed out — documents may be too large",
                status_code=408,
            ) from exc
        except (OSError, ValueError, RuntimeError) as exc:
            raise AppError(
                code="DOCX_MERGE_FAILED",
                message=f"DOCX merge failed: {exc}",
                status_code=400,
            ) from exc

        stored = self._files.save_bytes(result_bytes)
        return self._to_result(
            stored.file_id, stored.size,
            filename=out_name, content_type=content_type, credit_cost=credit_cost,
        )

    async def split(
        self,
        *,
        docx_bytes: bytes,
        filename: str,
        split_level: int = 1,
        credit_cost: int = 0,
    ) -> FileResult:
        """Split DOCX by heading level, return ZIP of DOCX files."""
        try:
            zip_bytes = await run_sync(split_docx, docx_bytes, split_level)
        except (OSError, ValueError, RuntimeError) as exc:
            raise AppError(
                code="DOCX_SPLIT_FAILED",
                message=f"DOCX split failed: {exc}",
                status_code=400,
            ) from exc

        out_name = f"{self._safe_stem(filename, 'document')}-split.zip"
        stored = self._files.save_bytes(zip_bytes)
        return self._to_result(
            stored.file_id, stored.size,
            filename=out_name, content_type="application/zip", credit_cost=credit_cost,
        )

    async def compress(
        self,
        *,
        docx_bytes: bytes,
        filename: str,
        image_quality: int = 75,
        credit_cost: int = 0,
    ) -> FileResult:
        """Compress DOCX by recompressing images and stripping metadata."""
        try:
            compressed = await run_sync(compress_docx, docx_bytes, image_quality)
        except (OSError, ValueError, RuntimeError) as exc:
            raise AppError(
                code="DOCX_COMPRESS_FAILED",
                message=f"DOCX compression failed: {exc}",
                status_code=400,
            ) from exc

        out_name = f"{self._safe_stem(filename, 'document')}-compressed.docx"
        stored = self._files.save_bytes(compressed)
        return self._to_result(
            stored.file_id, stored.size,
            filename=out_name, content_type=_DOCX_CONTENT_TYPE, credit_cost=credit_cost,
        )
