"""All /v1/* endpoints.  Thin dispatch to engines."""
from __future__ import annotations

import asyncio
import base64
import io
import logging
import time
from typing import Any

import numpy as np
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from PIL import Image
from pydantic import BaseModel

from app.config import settings
from app.engines.base import BaseEngine
from app.model_manager import OnnxModelManager
from app.utils import decode_image

logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────


class GpuBusyError(Exception):
    """Raised when all GPU inference slots are occupied."""


def _error(code: str, message: str, status_code: int = 400) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message}},
    )


def _meta(engine: str, model: str, elapsed_ms: int,
          input_size: tuple[int, int], output_size: tuple[int, int],
          **extra: Any) -> dict[str, Any]:
    return {
        "engine": engine,
        "model": model,
        "elapsed_ms": elapsed_ms,
        "input_size": list(input_size),
        "output_size": list(output_size),
        **extra,
    }


# ── Request models ────────────────────────────────────────────────────


class RemoveBgRequest(BaseModel):
    image_b64: str
    model: str = "general"
    output_type: str = "rgba"
    threshold: float | None = None


class UpscaleRequest(BaseModel):
    image_b64: str
    model: str = "x4plus"
    scale: int = 4
    denoise_strength: float | None = None
    tile_size: int = 0
    face_enhance: bool = False


class RestoreFaceRequest(BaseModel):
    image_b64: str
    weight: float = 0.5
    upscale: int = 2
    only_center_face: bool = False
    bg_upsampler: bool = False
    aligned: bool = False


class DenoiseRequest(BaseModel):
    image_b64: str
    task: str = "denoise"
    strength: float = 1.0
    model_width: int = 64
    tile_size: int = 0


class ColorizeRequest(BaseModel):
    image_b64: str
    model: str = "artistic"
    input_size: int = 512


class InpaintRequest(BaseModel):
    image_b64: str
    mask_b64: str
    model: str = "auto"
    dilate_kernel: int = 0


class OcrRequest(BaseModel):
    image_b64: str
    lang: str = "ch_en"
    det_only: bool = False
    box_thresh: float = 0.5
    text_score: float = 0.5
    return_word_box: bool = False


class SegmentRequest(BaseModel):
    image_b64: str
    points: list[list[float]] | None = None
    boxes: list[list[float]] | None = None
    multimask: bool = False
    mask_input_b64: str | None = None


# ── Router factory ────────────────────────────────────────────────────


def create_router(manager: OnnxModelManager) -> APIRouter:
    router = APIRouter(prefix="/v1")
    _gpu_sem = asyncio.Semaphore(settings.max_concurrent)

    async def _gpu_run(engine: BaseEngine, image: np.ndarray, **kwargs: Any) -> dict[str, Any]:
        """Run engine inference in a thread pool with GPU concurrency control."""
        try:
            async with asyncio.timeout(settings.gpu_queue_timeout):
                async with _gpu_sem:
                    return await asyncio.to_thread(engine.run, manager, image, **kwargs)
        except TimeoutError:
            raise GpuBusyError()

    @router.post("/remove-background")
    async def remove_background(req: RemoveBgRequest) -> dict | JSONResponse:
        from app.engines.birefnet import BiRefNetEngine

        image, (w, h) = decode_image(req.image_b64)
        t0 = time.perf_counter()
        try:
            result = await _gpu_run(
                BiRefNetEngine(), image,
                model=req.model, output_type=req.output_type, threshold=req.threshold,
            )
        except GpuBusyError:
            return _error("GPU_BUSY", "All GPU slots occupied, try again later", 503)
        except FileNotFoundError:
            return _error("MODEL_NOT_FOUND", f"Model '{req.model}' not found", 400)
        except Exception as exc:
            logger.exception("remove-background failed")
            return _error("INFERENCE_FAILED", str(exc), 500)
        elapsed = int((time.perf_counter() - t0) * 1000)
        result["meta"] = _meta(
            "birefnet", f"birefnet-{req.model}", elapsed, (w, h),
            result.get("output_size", (w, h)),
            **{k: v for k, v in result.get("extra_meta", {}).items()},
        )
        result.pop("extra_meta", None)
        result.pop("output_size", None)
        return result

    @router.post("/upscale")
    async def upscale(req: UpscaleRequest) -> dict | JSONResponse:
        from app.engines.realesrgan import RealESRGANEngine

        image, (w, h) = decode_image(req.image_b64)
        t0 = time.perf_counter()
        try:
            result = await _gpu_run(
                RealESRGANEngine(), image,
                model=req.model, scale=req.scale, tile_size=req.tile_size,
                denoise_strength=req.denoise_strength, face_enhance=req.face_enhance,
            )
        except GpuBusyError:
            return _error("GPU_BUSY", "All GPU slots occupied, try again later", 503)
        except FileNotFoundError:
            return _error("MODEL_NOT_FOUND", f"Model '{req.model}' not found", 400)
        except Exception as exc:
            logger.exception("upscale failed")
            return _error("INFERENCE_FAILED", str(exc), 500)
        elapsed = int((time.perf_counter() - t0) * 1000)
        result["meta"] = _meta(
            "realesrgan", f"realesrgan-{req.model}", elapsed, (w, h),
            result.get("output_size", (w * req.scale, h * req.scale)),
            **{k: v for k, v in result.get("extra_meta", {}).items()},
        )
        result.pop("extra_meta", None)
        result.pop("output_size", None)
        return result

    @router.post("/restore-face")
    async def restore_face(req: RestoreFaceRequest) -> dict | JSONResponse:
        from app.engines.gfpgan import GFPGANEngine

        image, (w, h) = decode_image(req.image_b64)
        t0 = time.perf_counter()
        try:
            result = await _gpu_run(
                GFPGANEngine(), image,
                weight=req.weight, upscale=req.upscale,
                only_center_face=req.only_center_face,
                bg_upsampler=req.bg_upsampler, aligned=req.aligned,
            )
        except GpuBusyError:
            return _error("GPU_BUSY", "All GPU slots occupied, try again later", 503)
        except FileNotFoundError:
            return _error("MODEL_NOT_FOUND", "GFPGAN model not found", 400)
        except Exception as exc:
            logger.exception("restore-face failed")
            return _error("INFERENCE_FAILED", str(exc), 500)
        elapsed = int((time.perf_counter() - t0) * 1000)
        result["meta"] = _meta(
            "gfpgan", "gfpgan-v1.4", elapsed, (w, h),
            result.get("output_size", (w, h)),
            **{k: v for k, v in result.get("extra_meta", {}).items()},
        )
        result.pop("extra_meta", None)
        result.pop("output_size", None)
        return result

    @router.post("/denoise")
    async def denoise(req: DenoiseRequest) -> dict | JSONResponse:
        from app.engines.nafnet import NAFNetEngine

        image, (w, h) = decode_image(req.image_b64)
        t0 = time.perf_counter()
        try:
            result = await _gpu_run(
                NAFNetEngine(), image,
                task=req.task, strength=req.strength,
                model_width=req.model_width, tile_size=req.tile_size,
            )
        except GpuBusyError:
            return _error("GPU_BUSY", "All GPU slots occupied, try again later", 503)
        except FileNotFoundError:
            return _error("MODEL_NOT_FOUND", "NAFNet model not found", 400)
        except Exception as exc:
            logger.exception("denoise failed")
            return _error("INFERENCE_FAILED", str(exc), 500)
        elapsed = int((time.perf_counter() - t0) * 1000)
        result["meta"] = _meta(
            "nafnet", result.get("model_name", "nafnet"), elapsed, (w, h), (w, h),
            **{k: v for k, v in result.get("extra_meta", {}).items()},
        )
        result.pop("extra_meta", None)
        result.pop("model_name", None)
        return result

    @router.post("/colorize")
    async def colorize(req: ColorizeRequest) -> dict | JSONResponse:
        from app.engines.ddcolor import DDColorEngine

        image, (w, h) = decode_image(req.image_b64)
        t0 = time.perf_counter()
        try:
            result = await _gpu_run(
                DDColorEngine(), image,
                model=req.model, input_size=req.input_size,
            )
        except GpuBusyError:
            return _error("GPU_BUSY", "All GPU slots occupied, try again later", 503)
        except FileNotFoundError:
            return _error("MODEL_NOT_FOUND", f"DDColor model '{req.model}' not found", 400)
        except Exception as exc:
            logger.exception("colorize failed")
            return _error("INFERENCE_FAILED", str(exc), 500)
        elapsed = int((time.perf_counter() - t0) * 1000)
        result["meta"] = _meta(
            "ddcolor", f"ddcolor-{req.model}", elapsed, (w, h), (w, h),
            **{k: v for k, v in result.get("extra_meta", {}).items()},
        )
        result.pop("extra_meta", None)
        return result

    @router.post("/inpaint")
    async def inpaint(req: InpaintRequest) -> dict | JSONResponse:
        from app.engines.lama import LaMaEngine
        from app.engines.migan import MIGANEngine

        image, (w, h) = decode_image(req.image_b64)
        mask_raw = base64.b64decode(req.mask_b64)
        mask = np.array(Image.open(io.BytesIO(mask_raw)).convert("L"))

        # Auto-route based on mask area
        model = req.model
        if model == "auto":
            mask_ratio = np.sum(mask > 127) / mask.size
            model = "migan" if mask_ratio < 0.10 else "lama"

        t0 = time.perf_counter()
        try:
            engine = MIGANEngine() if model == "migan" else LaMaEngine()
            result = await _gpu_run(
                engine, image, mask=mask,
                dilate_kernel=req.dilate_kernel,
            )
        except GpuBusyError:
            return _error("GPU_BUSY", "All GPU slots occupied, try again later", 503)
        except FileNotFoundError:
            return _error("MODEL_NOT_FOUND", f"Inpaint model '{model}' not found", 400)
        except Exception as exc:
            logger.exception("inpaint failed")
            return _error("INFERENCE_FAILED", str(exc), 500)
        elapsed = int((time.perf_counter() - t0) * 1000)
        mask_ratio = float(np.sum(mask > 127) / mask.size)
        result["meta"] = _meta(
            model, model, elapsed, (w, h), (w, h),
            model_used=model,
            mask_area_ratio=round(mask_ratio, 4),
            dilate_applied=req.dilate_kernel,
        )
        result.pop("extra_meta", None)
        return result

    @router.post("/ocr")
    async def ocr(req: OcrRequest) -> dict | JSONResponse:
        from app.engines.rapidocr import RapidOCREngine

        image, (w, h) = decode_image(req.image_b64)
        t0 = time.perf_counter()
        try:
            result = await _gpu_run(
                RapidOCREngine(), image,
                lang=req.lang, det_only=req.det_only,
                box_thresh=req.box_thresh, text_score=req.text_score,
                return_word_box=req.return_word_box,
            )
        except GpuBusyError:
            return _error("GPU_BUSY", "All GPU slots occupied, try again later", 503)
        except Exception as exc:
            logger.exception("ocr failed")
            return _error("INFERENCE_FAILED", str(exc), 500)
        elapsed = int((time.perf_counter() - t0) * 1000)
        result["meta"] = {
            "engine": "rapidocr",
            "lang": req.lang,
            "elapsed_ms": elapsed,
            "input_size": [w, h],
            "lines_count": len(result.get("lines", [])),
            "det_only": req.det_only,
        }
        return result

    @router.post("/segment")
    async def segment(req: SegmentRequest) -> dict | JSONResponse:
        from app.engines.mobilesam import MobileSAMEngine

        image, (w, h) = decode_image(req.image_b64)
        t0 = time.perf_counter()
        try:
            result = await _gpu_run(
                MobileSAMEngine(), image,
                points=req.points, boxes=req.boxes,
                multimask=req.multimask, mask_input_b64=req.mask_input_b64,
            )
        except GpuBusyError:
            return _error("GPU_BUSY", "All GPU slots occupied, try again later", 503)
        except Exception as exc:
            logger.exception("segment failed")
            return _error("INFERENCE_FAILED", str(exc), 500)
        elapsed = int((time.perf_counter() - t0) * 1000)
        result["meta"] = {
            "engine": "mobilesam",
            "elapsed_ms": elapsed,
            "input_size": [w, h],
            "masks_count": len(result.get("masks", [])),
        }
        return result

    return router
