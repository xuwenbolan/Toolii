from __future__ import annotations

import asyncio
import os
from functools import partial
from typing import Iterable

from app.core.config import settings
from app.core.exceptions import AppError
from app.processing.image_compress import compress_image
from app.processing.image_convert import convert_image
from app.processing.image_mosaic import MosaicRegion, mosaic_image
from app.processing.scan_enhance import enhance_scan
from app.schemas.image import FileResult, OcrResult, SegmentResult
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
            expires_in=settings.file_retention_hours * 3600,
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
                message="output_format only supports jpeg/png/webp",
                status_code=400,
            )

        max_bytes = int(target_kb * 1024) if target_kb else None
        if quality is not None and not (1 <= quality <= 100):
            raise AppError(code="INVALID_QUALITY", message="quality must be between 1 and 100", status_code=400)
        if target_kb is not None and target_kb <= 0:
            raise AppError(code="INVALID_TARGET_KB", message="target_kb must be greater than 0", status_code=400)

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
            raise AppError(code="IMAGE_PROCESS_FAILED", message="Image compression failed", status_code=400) from exc

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
                message="output_format only supports jpeg/png/webp",
                status_code=400,
            )
        if quality is not None and not (1 <= quality <= 100):
            raise AppError(code="INVALID_QUALITY", message="quality must be between 1 and 100", status_code=400)

        loop = asyncio.get_running_loop()
        try:
            out, mime = await loop.run_in_executor(
                None,
                partial(convert_image, image_bytes, output_format=output_format, quality=quality),  # type: ignore[arg-type]
            )
        except (OSError, ValueError, RuntimeError) as exc:
            raise AppError(code="IMAGE_PROCESS_FAILED", message="Image conversion failed", status_code=400) from exc

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
            raise AppError(code="IMAGE_PROCESS_FAILED", message="Image mosaic failed", status_code=400) from exc

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
            raise AppError(code="INVALID_MODE", message="mode only supports bw/color", status_code=400)

        loop = asyncio.get_running_loop()
        try:
            out, mime = await loop.run_in_executor(None, partial(enhance_scan, image_bytes, mode=mode))  # type: ignore[arg-type]
        except (OSError, ValueError, RuntimeError) as exc:
            raise AppError(code="IMAGE_PROCESS_FAILED", message="Scan enhancement failed", status_code=400) from exc

        out_name = f"{_safe_stem(filename)}-scan{_ext_for_mime(mime)}"
        stored = self._files.save_bytes(data=out, filename=out_name, content_type=mime)
        return self._to_result(stored, filename=out_name)

    async def remove_bg(
        self,
        *,
        image_bytes: bytes,
        filename: str,
    ) -> FileResult:
        from app.services.cortex_client import remove_background as cortex_remove_bg

        try:
            out, _meta = await cortex_remove_bg(image_bytes)
        except AppError:
            raise
        except Exception as exc:
            raise AppError(code="IMAGE_PROCESS_FAILED", message="Background removal failed", status_code=500) from exc

        out_name = f"{_safe_stem(filename)}-nobg.png"
        stored = self._files.save_bytes(data=out, filename=out_name, content_type="image/png")
        return self._to_result(stored, filename=out_name)

    async def upscale(
        self,
        *,
        image_bytes: bytes,
        filename: str,
        scale: int = 4,
    ) -> FileResult:
        if scale not in (2, 4):
            raise AppError(code="INVALID_SCALE", message="scale must be 2 or 4", status_code=400)

        from app.services.cortex_client import upscale as cortex_upscale

        try:
            out, _meta = await cortex_upscale(image_bytes, scale=scale)
        except AppError:
            raise
        except Exception as exc:
            raise AppError(code="IMAGE_PROCESS_FAILED", message="Image upscaling failed", status_code=502) from exc

        out_name = f"{_safe_stem(filename)}-{scale}x.png"
        stored = self._files.save_bytes(data=out, filename=out_name, content_type="image/png")
        return self._to_result(stored, filename=out_name)

    async def restore_face(
        self,
        *,
        image_bytes: bytes,
        filename: str,
        w: float = 0.5,
    ) -> FileResult:
        if not (0.0 <= w <= 1.0):
            raise AppError(code="INVALID_W", message="w must be between 0 and 1", status_code=400)

        from app.services.cortex_client import restore_face as cortex_restore_face

        try:
            out, _meta = await cortex_restore_face(image_bytes, w=w)
        except AppError:
            raise
        except Exception as exc:
            raise AppError(code="IMAGE_PROCESS_FAILED", message="Face restoration failed", status_code=502) from exc

        out_name = f"{_safe_stem(filename)}-restored.png"
        stored = self._files.save_bytes(data=out, filename=out_name, content_type="image/png")
        return self._to_result(stored, filename=out_name)

    async def denoise(
        self,
        *,
        image_bytes: bytes,
        filename: str,
        strength: float = 0.5,
    ) -> FileResult:
        if not (0.0 <= strength <= 1.0):
            raise AppError(code="INVALID_STRENGTH", message="strength must be between 0 and 1", status_code=400)

        from app.services.cortex_client import denoise as cortex_denoise

        try:
            out, _meta = await cortex_denoise(image_bytes, strength=strength)
        except AppError:
            raise
        except Exception as exc:
            raise AppError(code="IMAGE_PROCESS_FAILED", message="Image denoising failed", status_code=502) from exc

        out_name = f"{_safe_stem(filename)}-denoised.png"
        stored = self._files.save_bytes(data=out, filename=out_name, content_type="image/png")
        return self._to_result(stored, filename=out_name)

    async def colorize(
        self,
        *,
        image_bytes: bytes,
        filename: str,
    ) -> FileResult:
        from app.services.cortex_client import colorize as cortex_colorize

        try:
            out, _meta = await cortex_colorize(image_bytes)
        except AppError:
            raise
        except Exception as exc:
            raise AppError(code="IMAGE_PROCESS_FAILED", message="Image colorization failed", status_code=502) from exc

        out_name = f"{_safe_stem(filename)}-colorized.png"
        stored = self._files.save_bytes(data=out, filename=out_name, content_type="image/png")
        return self._to_result(stored, filename=out_name)

    async def inpaint(
        self,
        *,
        image_bytes: bytes,
        mask_bytes: bytes,
        filename: str,
    ) -> FileResult:
        from app.services.cortex_client import inpaint as cortex_inpaint

        try:
            out, _meta = await cortex_inpaint(image_bytes, mask_bytes)
        except AppError:
            raise
        except Exception as exc:
            raise AppError(code="IMAGE_PROCESS_FAILED", message="Image inpainting failed", status_code=502) from exc

        out_name = f"{_safe_stem(filename)}-inpainted.png"
        stored = self._files.save_bytes(data=out, filename=out_name, content_type="image/png")
        return self._to_result(stored, filename=out_name)

    async def ocr(
        self,
        *,
        image_bytes: bytes,
        lang: str = "ch_en",
    ) -> OcrResult:
        if lang not in ("ch", "en", "ch_en"):
            raise AppError(code="INVALID_LANG", message="lang must be ch, en, or ch_en", status_code=400)

        from app.services.cortex_client import ocr as cortex_ocr

        try:
            data = await cortex_ocr(image_bytes, lang=lang)
        except AppError:
            raise
        except Exception as exc:
            raise AppError(code="IMAGE_PROCESS_FAILED", message="OCR failed", status_code=502) from exc

        lines = data.get("lines", [])
        full_text = "\n".join(line["text"] for line in lines)
        return OcrResult(
            engine=data.get("engine", "paddleocr"),
            lang=data.get("lang", lang),
            width=data.get("width", 0),
            height=data.get("height", 0),
            lines=lines,
            full_text=full_text,
        )

    async def segment(
        self,
        *,
        image_bytes: bytes,
        points: list[list[float]] | None = None,
        boxes: list[list[float]] | None = None,
    ) -> SegmentResult:
        import base64

        from app.services.cortex_client import segment as cortex_segment

        try:
            mask_bytes, meta = await cortex_segment(image_bytes, points=points, boxes=boxes)
        except AppError:
            raise
        except Exception as exc:
            raise AppError(code="IMAGE_PROCESS_FAILED", message="Segmentation failed", status_code=502) from exc

        return SegmentResult(
            mask_b64=base64.b64encode(mask_bytes).decode("ascii"),
            score=meta.get("score", 0.0),
            width=meta.get("width", 0),
            height=meta.get("height", 0),
        )

