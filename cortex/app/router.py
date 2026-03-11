"""All /v1/* endpoints.  Thin dispatch to engines."""
from __future__ import annotations

import base64
import io
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import numpy as np
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from PIL import Image
from pydantic import BaseModel

from app import gpu
from app.concurrency import (
    ConcurrencyManager,
    GpuBusyError,
    InferenceTimeoutError,
    ModelUnavailableError,
)
from app.config import settings
from app.engines.base import BaseEngine
from app.model_manager import ModelDisabledError, OnnxModelManager
from app.request_stats import RequestStatsTracker

logger = logging.getLogger(__name__)


# -- Helpers -------------------------------------------------------------------


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


def _validate_and_decode(image_b64: str) -> tuple[np.ndarray, tuple[int, int]] | JSONResponse:
    """Validate payload size and image dimensions, then decode."""
    from app.utils import decode_image

    raw_size = len(image_b64) * 3 // 4
    if raw_size > settings.max_payload_mb * 1024 * 1024:
        return _error(
            "PAYLOAD_TOO_LARGE",
            f"Payload ~{raw_size // (1024 * 1024)}MB exceeds {settings.max_payload_mb}MB limit",
            413,
        )
    try:
        image, (w, h) = decode_image(image_b64)
    except Exception:
        return _error("INVALID_IMAGE", "Failed to decode image_b64", 400)
    if w * h > settings.max_image_pixels:
        return _error(
            "IMAGE_TOO_LARGE",
            f"Image {w}x{h} ({w * h} pixels) exceeds {settings.max_image_pixels} pixel limit",
            413,
        )
    return image, (w, h)


# -- Request models ------------------------------------------------------------


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


# -- CortexRouter -------------------------------------------------------------


@dataclass
class CortexRouter:
    """Holds the APIRouter and accessor methods (replaces monkey-patching)."""
    router: APIRouter
    get_stats: Callable[[], dict[str, Any]]
    queue_info: Callable[[], dict[str, Any]]
    dump_stats: Callable[[], dict[str, Any]]
    load_stats: Callable[[dict[str, Any]], None]


# -- Router factory ------------------------------------------------------------


def create_cortex_router(
    manager: OnnxModelManager,
    engines: dict[str, BaseEngine],
    timeline: gpu.VramTimeline | None = None,
) -> CortexRouter:
    router = APIRouter(prefix="/v1")
    conc = ConcurrencyManager(manager, timeline)
    stats_tracker = RequestStatsTracker()

    # -- Common inference runner ----------------------------------------------

    async def _run_inference(
        endpoint: str,
        coro,
        *,
        model_hint: str = "",
    ) -> tuple[dict[str, Any], int] | JSONResponse:
        """Run an inference coroutine with unified error handling and stats.

        Returns (result_dict, elapsed_ms) on success, or JSONResponse on error.
        """
        t0 = time.perf_counter()
        try:
            result = await coro
        except GpuBusyError:
            stats_tracker.record(endpoint, 0, error=True)
            return _error("GPU_BUSY", "All GPU slots occupied, try again later", 503)
        except InferenceTimeoutError:
            stats_tracker.record(endpoint, 0, error=True)
            return _error("INFERENCE_TIMEOUT", "Inference timed out", 504)
        except ModelUnavailableError as exc:
            stats_tracker.record(endpoint, 0, error=True)
            return _error("MODEL_UNAVAILABLE", str(exc), 503)
        except ModelDisabledError as exc:
            return _error("MODEL_DISABLED", str(exc), 400)
        except (FileNotFoundError, ValueError):
            stats_tracker.record(endpoint, 0, error=True)
            msg = f"Model '{model_hint}' not found" if model_hint else "Model not found"
            return _error("MODEL_NOT_FOUND", msg, 400)
        except Exception as exc:
            logger.exception("%s failed", endpoint)
            stats_tracker.record(endpoint, 0, error=True)
            return _error("INFERENCE_FAILED", str(exc), 500)
        elapsed = int((time.perf_counter() - t0) * 1000)
        stats_tracker.record(endpoint, elapsed)
        return result, elapsed

    def _attach_meta(
        result: dict[str, Any],
        elapsed: int,
        engine: str,
        model: str,
        input_size: tuple[int, int],
        output_size: tuple[int, int],
        **extra: Any,
    ) -> dict[str, Any]:
        """Pop internal keys from result and attach standard meta."""
        gpu_profile = result.pop("_gpu_profile", {})
        extra_meta = result.pop("extra_meta", {})
        result.pop("output_size", None)
        result.pop("model_name", None)
        result["meta"] = _meta(
            engine, model, elapsed, input_size, output_size,
            gpu=gpu_profile, **extra_meta, **extra,
        )
        return result

    # -- Endpoints ---------------------------------------------------------

    @router.post("/remove-background", response_model=None)
    async def remove_background(req: RemoveBgRequest):
        decoded = _validate_and_decode(req.image_b64)
        if isinstance(decoded, JSONResponse):
            return decoded
        image, (w, h) = decoded
        out = await _run_inference(
            "remove-background",
            conc.dedup_run(
                conc.gpu_run, engines["birefnet"], req.image_b64,
                image, endpoint="remove-background",
                model=req.model, output_type=req.output_type, threshold=req.threshold,
            ),
            model_hint=req.model,
        )
        if isinstance(out, JSONResponse):
            return out
        result, elapsed = out
        return _attach_meta(
            result, elapsed, "birefnet", f"birefnet-{req.model}",
            (w, h), result.get("output_size", (w, h)),
        )

    @router.post("/upscale", response_model=None)
    async def upscale(req: UpscaleRequest):
        decoded = _validate_and_decode(req.image_b64)
        if isinstance(decoded, JSONResponse):
            return decoded
        image, (w, h) = decoded
        out = await _run_inference(
            "upscale",
            conc.dedup_run(
                conc.gpu_run, engines["realesrgan"], req.image_b64,
                image, endpoint="upscale",
                model=req.model, scale=req.scale, tile_size=req.tile_size,
                denoise_strength=req.denoise_strength, face_enhance=req.face_enhance,
            ),
            model_hint=req.model,
        )
        if isinstance(out, JSONResponse):
            return out
        result, elapsed = out
        return _attach_meta(
            result, elapsed, "realesrgan", f"realesrgan-{req.model}",
            (w, h), result.get("output_size", (w * req.scale, h * req.scale)),
        )

    @router.post("/restore-face", response_model=None)
    async def restore_face(req: RestoreFaceRequest):
        decoded = _validate_and_decode(req.image_b64)
        if isinstance(decoded, JSONResponse):
            return decoded
        image, (w, h) = decoded
        out = await _run_inference(
            "restore-face",
            conc.dedup_run(
                conc.gpu_run, engines["gfpgan"], req.image_b64,
                image, endpoint="restore-face",
                weight=req.weight, upscale=req.upscale,
                only_center_face=req.only_center_face,
                bg_upsampler=req.bg_upsampler, aligned=req.aligned,
            ),
            model_hint="gfpgan",
        )
        if isinstance(out, JSONResponse):
            return out
        result, elapsed = out
        return _attach_meta(
            result, elapsed, "gfpgan", "gfpgan-v1.4",
            (w, h), result.get("output_size", (w, h)),
        )

    @router.post("/denoise", response_model=None)
    async def denoise(req: DenoiseRequest):
        decoded = _validate_and_decode(req.image_b64)
        if isinstance(decoded, JSONResponse):
            return decoded
        image, (w, h) = decoded
        out = await _run_inference(
            "denoise",
            conc.dedup_run(
                conc.gpu_run, engines["nafnet"], req.image_b64,
                image, endpoint="denoise",
                task=req.task, strength=req.strength,
                model_width=req.model_width, tile_size=req.tile_size,
            ),
            model_hint="nafnet",
        )
        if isinstance(out, JSONResponse):
            return out
        result, elapsed = out
        model_name = result.get("model_name", "nafnet")
        return _attach_meta(
            result, elapsed, "nafnet", model_name, (w, h), (w, h),
        )

    @router.post("/colorize", response_model=None)
    async def colorize(req: ColorizeRequest):
        decoded = _validate_and_decode(req.image_b64)
        if isinstance(decoded, JSONResponse):
            return decoded
        image, (w, h) = decoded
        out = await _run_inference(
            "colorize",
            conc.dedup_run(
                conc.gpu_run, engines["ddcolor"], req.image_b64,
                image, endpoint="colorize",
                model=req.model, input_size=req.input_size,
            ),
            model_hint=req.model,
        )
        if isinstance(out, JSONResponse):
            return out
        result, elapsed = out
        return _attach_meta(
            result, elapsed, "ddcolor", f"ddcolor-{req.model}", (w, h), (w, h),
        )

    @router.post("/inpaint", response_model=None)
    async def inpaint(req: InpaintRequest):
        decoded = _validate_and_decode(req.image_b64)
        if isinstance(decoded, JSONResponse):
            return decoded
        image, (w, h) = decoded
        try:
            mask_raw = base64.b64decode(req.mask_b64)
            mask = np.array(Image.open(io.BytesIO(mask_raw)).convert("L"))
        except Exception:
            return _error("INVALID_IMAGE", "Failed to decode mask_b64", 400)

        # Auto-route based on mask area
        model = req.model
        if model == "auto":
            mask_ratio = np.sum(mask > 127) / mask.size
            model = "migan" if mask_ratio < 0.10 else "lama"

        engine = engines["migan"] if model == "migan" else engines["lama"]
        # LaMa is CPU-only (FFT ops lack CUDA kernels); don't block GPU slots
        run_fn = conc.cpu_run if model == "lama" else conc.gpu_run
        out = await _run_inference(
            "inpaint",
            run_fn(engine, image, endpoint="inpaint", mask=mask, dilate_kernel=req.dilate_kernel),
            model_hint=model,
        )
        if isinstance(out, JSONResponse):
            return out
        result, elapsed = out
        mask_ratio = float(np.sum(mask > 127) / mask.size)
        return _attach_meta(
            result, elapsed, model, model, (w, h), (w, h),
            model_used=model, mask_area_ratio=round(mask_ratio, 4),
            dilate_applied=req.dilate_kernel,
        )

    @router.post("/ocr", response_model=None)
    async def ocr(req: OcrRequest):
        decoded = _validate_and_decode(req.image_b64)
        if isinstance(decoded, JSONResponse):
            return decoded
        image, (w, h) = decoded
        out = await _run_inference(
            "ocr",
            conc.cpu_run(
                engines["rapidocr"], image, endpoint="ocr",
                lang=req.lang, det_only=req.det_only,
                box_thresh=req.box_thresh, text_score=req.text_score,
                return_word_box=req.return_word_box,
            ),
        )
        if isinstance(out, JSONResponse):
            return out
        result, elapsed = out
        gpu_profile = result.pop("_gpu_profile", {})
        result["meta"] = {
            "engine": "rapidocr",
            "lang": req.lang,
            "elapsed_ms": elapsed,
            "input_size": [w, h],
            "lines_count": len(result.get("lines", [])),
            "det_only": req.det_only,
            "gpu": gpu_profile,
        }
        return result

    @router.post("/segment", response_model=None)
    async def segment(req: SegmentRequest):
        decoded = _validate_and_decode(req.image_b64)
        if isinstance(decoded, JSONResponse):
            return decoded
        image, (w, h) = decoded
        out = await _run_inference(
            "segment",
            conc.gpu_run(
                engines["mobilesam"], image, endpoint="segment",
                points=req.points, boxes=req.boxes,
                multimask=req.multimask, mask_input_b64=req.mask_input_b64,
            ),
        )
        if isinstance(out, JSONResponse):
            return out
        result, elapsed = out
        gpu_profile = result.pop("_gpu_profile", {})
        result["meta"] = {
            "engine": "mobilesam",
            "elapsed_ms": elapsed,
            "input_size": [w, h],
            "masks_count": len(result.get("masks", [])),
            "gpu": gpu_profile,
        }
        return result

    # -- Accessor methods --------------------------------------------------

    return CortexRouter(
        router=router,
        get_stats=stats_tracker.get_stats,
        queue_info=conc.queue_info,
        dump_stats=stats_tracker.dump,
        load_stats=stats_tracker.load,
    )
