from __future__ import annotations

import asyncio
import io
import os
import zipfile
from functools import partial

from app.core.config import settings
from app.core.exceptions import AppError
from app.processing.image_compress import compress_image
from app.processing.image_convert import convert_image
from app.processing.image_mosaic import mosaic_image
from app.processing.scan_enhance import enhance_scan
from app.schemas.image import BatchItem, BatchResponse, FileResult
from app.services.file_service import FileService


def _safe_stem(filename: str) -> str:
    base = os.path.basename(filename or "image")
    stem = os.path.splitext(base)[0]
    return stem.strip() or "image"


def _ext_for_mime(content_type: str) -> str:
    ct = (content_type or "").lower()
    if ct == "image/jpeg":
        return ".jpg"
    if ct == "image/png":
        return ".png"
    if ct == "image/webp":
        return ".webp"
    if ct == "application/zip":
        return ".zip"
    return ""


class ImageService:
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

    async def compress(
        self,
        *,
        image_bytes: bytes,
        filename: str,
        quality: int | None,
        target_kb: int | None,
        output_format: str | None,
    ) -> FileResult:
        if output_format is not None and output_format.lower() not in {"jpeg", "jpg", "png", "webp"}:
            raise AppError(
                code="INVALID_OUTPUT_FORMAT",
                message="output_format 仅支持 jpeg/png/webp",
                status_code=400,
            )

        max_bytes = int(target_kb * 1024) if target_kb else None
        if quality is not None and not (1 <= quality <= 100):
            raise AppError(code="INVALID_QUALITY", message="quality 必须在 1-100 之间", status_code=400)
        if target_kb is not None and target_kb <= 0:
            raise AppError(code="INVALID_TARGET_KB", message="target_kb 必须大于 0", status_code=400)

        loop = asyncio.get_running_loop()
        try:
            out, mime = await loop.run_in_executor(
                None,
                partial(
                    compress_image,
                    image_bytes,
                    output_format=output_format,  # type: ignore[arg-type]
                    quality=quality,
                    max_bytes=max_bytes,
                ),
            )
        except Exception as exc:  # noqa: BLE001
            raise AppError(code="IMAGE_PROCESS_FAILED", message="图片压缩失败", status_code=400) from exc

        out_name = f"{_safe_stem(filename)}-compressed{_ext_for_mime(mime)}"
        stored = self._files.save_bytes(data=out, filename=out_name, content_type=mime)
        return self._to_result(stored, filename=out_name)

    async def convert(
        self,
        *,
        image_bytes: bytes,
        filename: str,
        output_format: str,
        quality: int | None,
    ) -> FileResult:
        if output_format.lower() not in {"jpeg", "jpg", "png", "webp"}:
            raise AppError(
                code="INVALID_OUTPUT_FORMAT",
                message="output_format 仅支持 jpeg/png/webp",
                status_code=400,
            )
        if quality is not None and not (1 <= quality <= 100):
            raise AppError(code="INVALID_QUALITY", message="quality 必须在 1-100 之间", status_code=400)

        loop = asyncio.get_running_loop()
        try:
            out, mime = await loop.run_in_executor(
                None,
                partial(convert_image, image_bytes, output_format=output_format, quality=quality),  # type: ignore[arg-type]
            )
        except Exception as exc:  # noqa: BLE001
            raise AppError(code="IMAGE_PROCESS_FAILED", message="图片转换失败", status_code=400) from exc

        out_name = f"{_safe_stem(filename)}{_ext_for_mime(mime)}"
        stored = self._files.save_bytes(data=out, filename=out_name, content_type=mime)
        return self._to_result(stored, filename=out_name)

    async def mosaic(
        self,
        *,
        image_bytes: bytes,
        filename: str,
        regions,
        pixel_size: int,
    ) -> FileResult:  # type: ignore[no-untyped-def]
        loop = asyncio.get_running_loop()
        try:
            out, mime = await loop.run_in_executor(
                None,
                partial(mosaic_image, image_bytes, regions=regions, pixel_size=pixel_size),
            )
        except Exception as exc:  # noqa: BLE001
            raise AppError(code="IMAGE_PROCESS_FAILED", message="图片马赛克失败", status_code=400) from exc

        out_name = f"{_safe_stem(filename)}-mosaic{_ext_for_mime(mime)}"
        stored = self._files.save_bytes(data=out, filename=out_name, content_type=mime)
        return self._to_result(stored, filename=out_name)

    async def scan_enhance(
        self,
        *,
        image_bytes: bytes,
        filename: str,
        mode: str,
    ) -> FileResult:
        if mode not in {"bw", "color"}:
            raise AppError(code="INVALID_MODE", message="mode 仅支持 bw/color", status_code=400)

        loop = asyncio.get_running_loop()
        try:
            out, mime = await loop.run_in_executor(None, partial(enhance_scan, image_bytes, mode=mode))  # type: ignore[arg-type]
        except Exception as exc:  # noqa: BLE001
            raise AppError(code="IMAGE_PROCESS_FAILED", message="扫描增强失败", status_code=400) from exc

        out_name = f"{_safe_stem(filename)}-scan{_ext_for_mime(mime)}"
        stored = self._files.save_bytes(data=out, filename=out_name, content_type=mime)
        return self._to_result(stored, filename=out_name)

    async def batch(
        self,
        *,
        files: list[tuple[str, bytes]],
        action: str,
        output_format: str | None = None,
        quality: int | None = None,
        target_kb: int | None = None,
    ) -> BatchResponse:
        if action not in {"compress", "convert"}:
            raise AppError(code="INVALID_ACTION", message="batch action 仅支持 compress/convert", status_code=400)

        items: list[BatchItem] = []
        zip_buf = io.BytesIO()

        with zipfile.ZipFile(zip_buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for input_name, image_bytes in files:
                if action == "compress":
                    result = await self.compress(
                        image_bytes=image_bytes,
                        filename=input_name,
                        quality=quality,
                        target_kb=target_kb,
                        output_format=output_format,
                    )
                else:
                    if not output_format:
                        raise AppError(code="MISSING_OUTPUT_FORMAT", message="output_format 必填", status_code=400)
                    result = await self.convert(
                        image_bytes=image_bytes,
                        filename=input_name,
                        output_format=output_format,
                        quality=quality,
                    )

                # Fetch actual bytes for archiving (we already stored it on disk).
                stored = self._files.get(result.file_id)
                zf.write(stored.path, arcname=result.filename)

                items.append(BatchItem(input_filename=input_name, output=result))

        archive_name = f"toolii-batch{_ext_for_mime('application/zip')}"
        archive_bytes = zip_buf.getvalue()
        archive_stored = self._files.save_bytes(
            data=archive_bytes,
            filename=archive_name,
            content_type="application/zip",
        )

        return BatchResponse(
            archive=self._to_result(archive_stored, filename=archive_name),
            items=items,
        )
