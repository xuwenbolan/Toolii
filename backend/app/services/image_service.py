from __future__ import annotations

import asyncio
import base64
import os
from functools import partial
from typing import Any, Iterable

from app.core.config import settings
from app.core.exceptions import AppError
from app.processing.image_compress import compress_image
from app.processing.image_convert import convert_image
from app.processing.image_mosaic import MosaicRegion, mosaic_image
from app.processing.scan_enhance import enhance_scan
from app.schemas.image import FileResult, OcrResult, SegmentResult
from app.services.file_service import FileService, StoredFile

# GPU operation registry: op_name -> (cortex_endpoint, filename_suffix_template)
_GPU_OPS: dict[str, tuple[str, str]] = {
    "remove_bg": ("/v1/remove-background", "-nobg.png"),
    "upscale": ("/v1/upscale", "-{scale}x.png"),
    "restore_face": ("/v1/restore-face", "-restored.png"),
    "denoise": ("/v1/denoise", "-denoised.png"),
    "colorize": ("/v1/colorize", "-colorized.png"),
}


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

    # ── Local CPU operations ──────────────────────────────────────────

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

    # ── GPU operations (via Cortex) ───────────────────────────────────

    async def _gpu_process(
        self,
        op: str,
        *,
        image_bytes: bytes,
        filename: str,
        **params: Any,
    ) -> FileResult:
        """Generic GPU processing via Cortex.  Extra params forwarded transparently."""
        from app.services.cortex_client import _b64, call as cortex_call
        from app.services.cortex_client import remove_background as cortex_remove_bg

        endpoint, suffix_tpl = _GPU_OPS[op]
        suffix = suffix_tpl.format_map({**params, "scale": params.get("scale", 4)})

        try:
            if op == "remove_bg":
                data = await cortex_remove_bg(image_bytes, **params)
            else:
                data = await cortex_call(endpoint, image_b64=_b64(image_bytes), **params)
        except AppError:
            raise
        except Exception as exc:
            status = 500 if op == "remove_bg" else 502
            raise AppError(
                code="IMAGE_PROCESS_FAILED",
                message=f"{op.replace('_', ' ').title()} failed",
                status_code=status,
            ) from exc

        out_bytes = base64.b64decode(data["image_b64"])
        out_name = f"{_safe_stem(filename)}{suffix}"
        stored = self._files.save_bytes(data=out_bytes, filename=out_name, content_type="image/png")
        return self._to_result(stored, filename=out_name)

    async def remove_bg(self, *, image_bytes: bytes, filename: str, **params: Any) -> FileResult:
        return await self._gpu_process("remove_bg", image_bytes=image_bytes, filename=filename, **params)

    async def upscale(self, *, image_bytes: bytes, filename: str, scale: int = 4, **params: Any) -> FileResult:
        if scale not in (2, 4):
            raise AppError(code="INVALID_SCALE", message="scale must be 2 or 4", status_code=400)
        return await self._gpu_process("upscale", image_bytes=image_bytes, filename=filename, scale=scale, **params)

    async def restore_face(self, *, image_bytes: bytes, filename: str, weight: float = 0.5, **params: Any) -> FileResult:
        if not (0.0 <= weight <= 1.0):
            raise AppError(code="INVALID_WEIGHT", message="weight must be between 0 and 1", status_code=400)
        return await self._gpu_process("restore_face", image_bytes=image_bytes, filename=filename, weight=weight, **params)

    async def denoise(self, *, image_bytes: bytes, filename: str, strength: float = 1.0, **params: Any) -> FileResult:
        if not (0.0 <= strength <= 1.0):
            raise AppError(code="INVALID_STRENGTH", message="strength must be between 0 and 1", status_code=400)
        return await self._gpu_process("denoise", image_bytes=image_bytes, filename=filename, strength=strength, **params)

    async def colorize(self, *, image_bytes: bytes, filename: str, **params: Any) -> FileResult:
        return await self._gpu_process("colorize", image_bytes=image_bytes, filename=filename, **params)

    async def inpaint(self, *, image_bytes: bytes, mask_bytes: bytes, filename: str, **params: Any) -> FileResult:
        from app.services.cortex_client import _b64, call as cortex_call

        try:
            data = await cortex_call(
                "/v1/inpaint",
                image_b64=_b64(image_bytes),
                mask_b64=_b64(mask_bytes),
                **params,
            )
        except AppError:
            raise
        except Exception as exc:
            raise AppError(code="IMAGE_PROCESS_FAILED", message="Image inpainting failed", status_code=502) from exc

        out_bytes = base64.b64decode(data["image_b64"])
        out_name = f"{_safe_stem(filename)}-inpainted.png"
        stored = self._files.save_bytes(data=out_bytes, filename=out_name, content_type="image/png")
        return self._to_result(stored, filename=out_name)

    async def ocr(self, *, image_bytes: bytes, lang: str = "ch_en", **params: Any) -> OcrResult:
        if lang not in ("ch", "en", "ch_en"):
            raise AppError(code="INVALID_LANG", message="lang must be ch, en, or ch_en", status_code=400)

        from app.services.cortex_client import _b64, call as cortex_call

        try:
            data = await cortex_call("/v1/ocr", image_b64=_b64(image_bytes), lang=lang, **params)
        except AppError:
            raise
        except Exception as exc:
            raise AppError(code="IMAGE_PROCESS_FAILED", message="OCR failed", status_code=502) from exc

        lines = data.get("lines", [])
        return OcrResult(
            lines=lines,
            full_text=data.get("full_text", "\n".join(line.get("text", "") for line in lines)),
            meta=data.get("meta"),
        )

    async def segment(
        self,
        *,
        image_bytes: bytes,
        points: list[list[float]] | None = None,
        boxes: list[list[float]] | None = None,
        multimask: bool = False,
        **params: Any,
    ) -> SegmentResult:
        from app.services.cortex_client import _b64, call as cortex_call

        extra: dict[str, Any] = {}
        if points is not None:
            extra["points"] = points
        if boxes is not None:
            extra["boxes"] = boxes
        if multimask:
            extra["multimask"] = True

        try:
            data = await cortex_call("/v1/segment", image_b64=_b64(image_bytes), **extra, **params)
        except AppError:
            raise
        except Exception as exc:
            raise AppError(code="IMAGE_PROCESS_FAILED", message="Segmentation failed", status_code=502) from exc

        return SegmentResult(
            masks=data.get("masks", []),
            meta=data.get("meta"),
        )
