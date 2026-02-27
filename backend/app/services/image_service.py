from __future__ import annotations

import asyncio
import os
from functools import partial
from typing import Iterable

from app.core.config import settings
from app.core.exceptions import AppError
from app.processing.background_removal import remove_background
from app.processing.image_compress import compress_image
from app.processing.image_convert import convert_image
from app.processing.image_mosaic import MosaicRegion, mosaic_image
from app.processing.scan_enhance import enhance_scan
from app.schemas.image import FileResult
from app.services.file_service import FileService, StoredFile


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
    return ""


class ImageService:
    def __init__(self) -> None:
        self._files = FileService()

    def _to_result(self, stored: StoredFile, *, filename: str) -> FileResult:
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
        except (OSError, ValueError, RuntimeError) as exc:
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
        except (OSError, ValueError, RuntimeError) as exc:
            raise AppError(code="IMAGE_PROCESS_FAILED", message="图片转换失败", status_code=400) from exc

        out_name = f"{_safe_stem(filename)}{_ext_for_mime(mime)}"
        stored = self._files.save_bytes(data=out, filename=out_name, content_type=mime)
        return self._to_result(stored, filename=out_name)

    async def mosaic(
        self,
        *,
        image_bytes: bytes,
        filename: str,
        regions: Iterable[MosaicRegion] | None,
        pixel_size: int,
    ) -> FileResult:
        loop = asyncio.get_running_loop()
        try:
            out, mime = await loop.run_in_executor(
                None,
                partial(mosaic_image, image_bytes, regions=regions, pixel_size=pixel_size),
            )
        except (OSError, ValueError, RuntimeError) as exc:
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
        except (OSError, ValueError, RuntimeError) as exc:
            raise AppError(code="IMAGE_PROCESS_FAILED", message="扫描增强失败", status_code=400) from exc

        out_name = f"{_safe_stem(filename)}-scan{_ext_for_mime(mime)}"
        stored = self._files.save_bytes(data=out, filename=out_name, content_type=mime)
        return self._to_result(stored, filename=out_name)

    async def remove_bg(
        self,
        *,
        image_bytes: bytes,
        filename: str,
        model_name: str = "silueta",
    ) -> FileResult:
        valid_models = {"silueta", "u2net_human_seg", "birefnet-portrait"}
        if model_name not in valid_models:
            raise AppError(code="INVALID_MODEL", message="model_name 无效", status_code=400)

        loop = asyncio.get_running_loop()
        try:
            out, _meta = await loop.run_in_executor(
                None,
                partial(remove_background, image_bytes, model_name=model_name),
            )
        except (OSError, ValueError, RuntimeError) as exc:
            raise AppError(code="IMAGE_PROCESS_FAILED", message="背景移除失败", status_code=400) from exc

        out_name = f"{_safe_stem(filename)}-nobg.png"
        stored = self._files.save_bytes(data=out, filename=out_name, content_type="image/png")
        return self._to_result(stored, filename=out_name)

