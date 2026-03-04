"""All /v1/* endpoints.  Thin dispatch to engines."""
from __future__ import annotations

import asyncio
import base64
import concurrent.futures
import dataclasses
import hashlib
import io
import logging
import threading
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
from app.config import settings
from app.engines.base import BaseEngine
from app.model_manager import CircuitBreakerOpen, OnnxModelManager
from app.utils import decode_image

logger = logging.getLogger(__name__)


# -- Exceptions ────────────────────────────────────────────────────────


class GpuBusyError(Exception):
    """Raised when all GPU inference slots are occupied."""


class InferenceTimeoutError(Exception):
    """Raised when inference exceeds timeout."""


class ModelUnavailableError(Exception):
    """Raised when a model is temporarily unavailable (e.g. circuit breaker)."""


# -- Helpers ───────────────────────────────────────────────────────────


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


# -- Request models ────────────────────────────────────────────────────


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


@dataclass
class EndpointStats:
    calls: int = 0
    errors: int = 0
    total_ms: int = 0
    min_ms: int = 999999
    max_ms: int = 0
    last_call: float = 0.0


# -- CortexRouter ─────────────────────────────────────────────────────


@dataclass
class CortexRouter:
    """Holds the APIRouter and accessor methods (replaces monkey-patching)."""
    router: APIRouter
    get_stats: Callable[[], dict[str, Any]]
    queue_info: Callable[[], dict[str, Any]]
    dump_stats: Callable[[], dict[str, Any]]
    load_stats: Callable[[dict[str, Any]], None]


# -- Router factory ────────────────────────────────────────────────────


def create_cortex_router(
    manager: OnnxModelManager,
    engines: dict[str, BaseEngine],
    timeline: gpu.VramTimeline | None = None,
) -> CortexRouter:
    router = APIRouter(prefix="/v1")
    _gpu_sem = asyncio.Semaphore(settings.max_concurrent)
    _cpu_sem = asyncio.Semaphore(settings.max_concurrent_cpu)
    _thread_pool = concurrent.futures.ThreadPoolExecutor(
        max_workers=settings.max_concurrent + 2,  # room for ghost threads
        thread_name_prefix="cortex-infer",
    )
    _stats: dict[str, EndpointStats] = {}

    # In-flight request deduplication: identical requests share the same
    # inference result instead of running twice on the GPU.
    # Only holds entries while inference is running — NOT a cache.
    _inflight: dict[str, asyncio.Future] = {}
    _inflight_lock = asyncio.Lock()

    def _request_key(endpoint: str, image_b64: str, **params: Any) -> str:
        """Build a dedup key from endpoint + image hash + sorted params.

        Uses incremental hashing to avoid copying the full base64 string.
        """
        h = hashlib.sha256()
        h.update(endpoint.encode())
        # Feed image_b64 directly as memoryview to avoid .encode() copy
        h.update(image_b64.encode())
        for k in sorted(params):
            v = params[k]
            # Skip non-hashable params (numpy arrays like mask)
            if isinstance(v, (str, int, float, bool, type(None))):
                h.update(f"{k}={v}".encode())
        return h.hexdigest()

    def _record_stat(endpoint: str, elapsed_ms: int, error: bool = False) -> None:
        s = _stats.setdefault(endpoint, EndpointStats())
        s.calls += 1
        s.last_call = time.time()
        s.total_ms += elapsed_ms
        if elapsed_ms < s.min_ms:
            s.min_ms = elapsed_ms
        if elapsed_ms > s.max_ms:
            s.max_ms = elapsed_ms
        if error:
            s.errors += 1

    async def _gpu_run(
        engine: BaseEngine, image: np.ndarray,
        endpoint: str = "", **kwargs: Any,
    ) -> dict[str, Any]:
        """Run engine inference in a thread pool with GPU concurrency control.

        Queue timeout applies to waiting for a free GPU slot.
        Inference timeout applies to the actual inference run.
        Attaches ``_gpu_profile`` dict to the result with per-inference
        GPU metrics (inference_ms, vram, utilization, temperature, power).

        On timeout the underlying thread keeps running (ONNX Runtime cannot
        be interrupted).  A background cleanup thread waits for it to finish
        and then releases the GPU semaphore and runs VRAM budget checks.
        """
        try:
            async with asyncio.timeout(settings.gpu_queue_timeout):
                await _gpu_sem.acquire()
        except TimeoutError:
            raise GpuBusyError()

        timed_out = False
        try:
            snap_before = gpu.gpu_snapshot()
            vram_before = snap_before.get("vram_used_mb", gpu.vram_used_mb())
            if timeline and endpoint:
                timeline.mark_event(f"inference:{endpoint}")
            t_infer = time.perf_counter()

            # Submit to a real executor so we get a concurrent.futures.Future
            # that we can wait on from a cleanup thread if timeout fires.
            cf_future: concurrent.futures.Future = _thread_pool.submit(
                engine.run, manager, image, **kwargs,
            )

            try:
                async with asyncio.timeout(settings.inference_timeout):
                    loop = asyncio.get_running_loop()
                    result = await asyncio.wrap_future(cf_future, loop=loop)
            except CircuitBreakerOpen as exc:
                raise ModelUnavailableError(str(exc))
            except TimeoutError:
                timed_out = True
                logger.error("Inference timeout (%s) after %.0fs",
                             endpoint, settings.inference_timeout)
                # Schedule background cleanup for the orphaned thread.
                # The semaphore is NOT released here — cleanup releases it
                # once the thread actually finishes.
                _schedule_ghost_cleanup(cf_future, endpoint, vram_before)
                raise InferenceTimeoutError()

            inference_ms = int((time.perf_counter() - t_infer) * 1000)
            snap_after = gpu.gpu_snapshot()
            vram_after = snap_after.get("vram_used_mb", gpu.vram_used_mb())
            manager.post_inference_check(vram_before, vram_after)
            result["_gpu_profile"] = {
                "inference_ms": inference_ms,
                "vram_before_mb": vram_before,
                "vram_after_mb": vram_after,
                "gpu_utilization_pct": snap_after.get("gpu_utilization_pct"),
                "temperature_c": snap_after.get("temperature_c"),
                "power_watts": snap_after.get("power_watts"),
            }
            return result
        finally:
            if not timed_out:
                _gpu_sem.release()

    def _schedule_ghost_cleanup(
        cf_future: concurrent.futures.Future, endpoint: str, vram_before: int,
    ) -> None:
        """Spawn a daemon thread that waits for a timed-out inference to
        finish, then releases the GPU semaphore and runs VRAM checks.

        asyncio.Semaphore.release() must be called from the event loop thread,
        so we use call_soon_threadsafe to schedule it.
        """
        loop = asyncio.get_running_loop()

        def _wait_and_cleanup() -> None:
            try:
                cf_future.result(timeout=600)  # hard cap: 10 min
            except Exception:
                pass
            # Release the GPU slot — must go through event loop
            loop.call_soon_threadsafe(_gpu_sem.release)
            vram_after = gpu.vram_used_mb()
            manager.post_inference_check(vram_before, vram_after)
            logger.info("Ghost inference cleanup (%s): VRAM %dMB -> %dMB",
                        endpoint, vram_before, vram_after)

        t = threading.Thread(target=_wait_and_cleanup, daemon=True,
                             name=f"ghost-cleanup-{endpoint}")
        t.start()

    async def _cpu_run(
        engine: BaseEngine, image: np.ndarray,
        endpoint: str = "", **kwargs: Any,
    ) -> dict[str, Any]:
        """Run CPU-only engine inference without occupying a GPU slot."""
        try:
            async with asyncio.timeout(settings.gpu_queue_timeout):
                await _cpu_sem.acquire()
        except TimeoutError:
            raise GpuBusyError()
        try:
            if timeline and endpoint:
                timeline.mark_event(f"inference:{endpoint}")
            t_infer = time.perf_counter()
            try:
                async with asyncio.timeout(settings.inference_timeout):
                    result = await asyncio.to_thread(engine.run, manager, image, **kwargs)
            except CircuitBreakerOpen as exc:
                raise ModelUnavailableError(str(exc))
            inference_ms = int((time.perf_counter() - t_infer) * 1000)
            result["_gpu_profile"] = {
                "inference_ms": inference_ms,
                "vram_before_mb": 0,
                "vram_after_mb": 0,
                "gpu_utilization_pct": None,
                "temperature_c": None,
                "power_watts": None,
                "cpu_only": True,
            }
            return result
        except TimeoutError:
            logger.error("CPU inference timeout (%s) after %.0fs",
                         endpoint, settings.inference_timeout)
            raise InferenceTimeoutError()
        finally:
            _cpu_sem.release()

    # -- In-flight dedup wrapper -------------------------------------------

    async def _dedup_run(
        run_fn: Callable, engine: BaseEngine, image_b64: str,
        image: np.ndarray, endpoint: str, **kwargs: Any,
    ) -> dict[str, Any]:
        """Deduplicate identical in-flight requests.

        If another request with the same endpoint + image + params is
        already running, wait for its result instead of running again.
        The first caller drives the actual inference; subsequent callers
        share the result via a shared asyncio.Future.

        NOT a cache — entries only exist while inference is in progress.
        """
        key = _request_key(endpoint, image_b64, **kwargs)

        is_driver = False
        async with _inflight_lock:
            if key in _inflight:
                shared_future = _inflight[key]
                logger.debug("Dedup hit for %s (key=%s...)", endpoint, key[:12])
            else:
                shared_future = asyncio.get_running_loop().create_future()
                _inflight[key] = shared_future
                is_driver = True

        if is_driver:
            # Run inference inline (not in a separate task) so the image
            # numpy array stays on this caller's stack and is freed when done.
            try:
                result = await run_fn(engine, image, endpoint=endpoint, **kwargs)
                shared_future.set_result(result)
            except BaseException as exc:
                # Catch BaseException (including CancelledError) so waiters
                # never hang on an unresolved future.
                if not shared_future.done():
                    shared_future.set_exception(exc)
                raise  # re-raise for the driver's endpoint handler
            finally:
                _inflight.pop(key, None)

        # Non-driver waiters (or driver on success) get the shared result.
        # Driver reaches here only on success; non-drivers always reach here.
        return dict(await shared_future)

    # -- Endpoints ---------------------------------------------------------

    @router.post("/remove-background", response_model=None)
    async def remove_background(req: RemoveBgRequest):
        decoded = _validate_and_decode(req.image_b64)
        if isinstance(decoded, JSONResponse):
            return decoded
        image, (w, h) = decoded
        t0 = time.perf_counter()
        try:
            result = await _dedup_run(
                _gpu_run, engines["birefnet"], req.image_b64,
                image, endpoint="remove-background",
                model=req.model, output_type=req.output_type, threshold=req.threshold,
            )
        except GpuBusyError:
            _record_stat("remove-background", 0, error=True)
            return _error("GPU_BUSY", "All GPU slots occupied, try again later", 503)
        except InferenceTimeoutError:
            _record_stat("remove-background", 0, error=True)
            return _error("INFERENCE_TIMEOUT", "Inference timed out", 504)
        except ModelUnavailableError as exc:
            _record_stat("remove-background", 0, error=True)
            return _error("MODEL_UNAVAILABLE", str(exc), 503)
        except (FileNotFoundError, ValueError):
            _record_stat("remove-background", 0, error=True)
            return _error("MODEL_NOT_FOUND", f"Model '{req.model}' not found", 400)
        except Exception as exc:
            logger.exception("remove-background failed")
            _record_stat("remove-background", 0, error=True)
            return _error("INFERENCE_FAILED", str(exc), 500)
        elapsed = int((time.perf_counter() - t0) * 1000)
        _record_stat("remove-background", elapsed)
        gpu_profile = result.pop("_gpu_profile", {})
        result["meta"] = _meta(
            "birefnet", f"birefnet-{req.model}", elapsed, (w, h),
            result.get("output_size", (w, h)),
            gpu=gpu_profile,
            **{k: v for k, v in result.get("extra_meta", {}).items()},
        )
        result.pop("extra_meta", None)
        result.pop("output_size", None)
        return result

    @router.post("/upscale", response_model=None)
    async def upscale(req: UpscaleRequest):
        decoded = _validate_and_decode(req.image_b64)
        if isinstance(decoded, JSONResponse):
            return decoded
        image, (w, h) = decoded
        t0 = time.perf_counter()
        try:
            result = await _dedup_run(
                _gpu_run, engines["realesrgan"], req.image_b64,
                image, endpoint="upscale",
                model=req.model, scale=req.scale, tile_size=req.tile_size,
                denoise_strength=req.denoise_strength, face_enhance=req.face_enhance,
            )
        except GpuBusyError:
            _record_stat("upscale", 0, error=True)
            return _error("GPU_BUSY", "All GPU slots occupied, try again later", 503)
        except InferenceTimeoutError:
            _record_stat("upscale", 0, error=True)
            return _error("INFERENCE_TIMEOUT", "Inference timed out", 504)
        except ModelUnavailableError as exc:
            _record_stat("upscale", 0, error=True)
            return _error("MODEL_UNAVAILABLE", str(exc), 503)
        except (FileNotFoundError, ValueError):
            _record_stat("upscale", 0, error=True)
            return _error("MODEL_NOT_FOUND", f"Model '{req.model}' not found", 400)
        except Exception as exc:
            logger.exception("upscale failed")
            _record_stat("upscale", 0, error=True)
            return _error("INFERENCE_FAILED", str(exc), 500)
        elapsed = int((time.perf_counter() - t0) * 1000)
        _record_stat("upscale", elapsed)
        gpu_profile = result.pop("_gpu_profile", {})
        result["meta"] = _meta(
            "realesrgan", f"realesrgan-{req.model}", elapsed, (w, h),
            result.get("output_size", (w * req.scale, h * req.scale)),
            gpu=gpu_profile,
            **{k: v for k, v in result.get("extra_meta", {}).items()},
        )
        result.pop("extra_meta", None)
        result.pop("output_size", None)
        return result

    @router.post("/restore-face", response_model=None)
    async def restore_face(req: RestoreFaceRequest):
        decoded = _validate_and_decode(req.image_b64)
        if isinstance(decoded, JSONResponse):
            return decoded
        image, (w, h) = decoded
        t0 = time.perf_counter()
        try:
            result = await _dedup_run(
                _gpu_run, engines["gfpgan"], req.image_b64,
                image, endpoint="restore-face",
                weight=req.weight, upscale=req.upscale,
                only_center_face=req.only_center_face,
                bg_upsampler=req.bg_upsampler, aligned=req.aligned,
            )
        except GpuBusyError:
            _record_stat("restore-face", 0, error=True)
            return _error("GPU_BUSY", "All GPU slots occupied, try again later", 503)
        except InferenceTimeoutError:
            _record_stat("restore-face", 0, error=True)
            return _error("INFERENCE_TIMEOUT", "Inference timed out", 504)
        except ModelUnavailableError as exc:
            _record_stat("restore-face", 0, error=True)
            return _error("MODEL_UNAVAILABLE", str(exc), 503)
        except (FileNotFoundError, ValueError):
            _record_stat("restore-face", 0, error=True)
            return _error("MODEL_NOT_FOUND", "GFPGAN model not found", 400)
        except Exception as exc:
            logger.exception("restore-face failed")
            _record_stat("restore-face", 0, error=True)
            return _error("INFERENCE_FAILED", str(exc), 500)
        elapsed = int((time.perf_counter() - t0) * 1000)
        _record_stat("restore-face", elapsed)
        gpu_profile = result.pop("_gpu_profile", {})
        result["meta"] = _meta(
            "gfpgan", "gfpgan-v1.4", elapsed, (w, h),
            result.get("output_size", (w, h)),
            gpu=gpu_profile,
            **{k: v for k, v in result.get("extra_meta", {}).items()},
        )
        result.pop("extra_meta", None)
        result.pop("output_size", None)
        return result

    @router.post("/denoise", response_model=None)
    async def denoise(req: DenoiseRequest):
        decoded = _validate_and_decode(req.image_b64)
        if isinstance(decoded, JSONResponse):
            return decoded
        image, (w, h) = decoded
        t0 = time.perf_counter()
        try:
            result = await _dedup_run(
                _gpu_run, engines["nafnet"], req.image_b64,
                image, endpoint="denoise",
                task=req.task, strength=req.strength,
                model_width=req.model_width, tile_size=req.tile_size,
            )
        except GpuBusyError:
            _record_stat("denoise", 0, error=True)
            return _error("GPU_BUSY", "All GPU slots occupied, try again later", 503)
        except InferenceTimeoutError:
            _record_stat("denoise", 0, error=True)
            return _error("INFERENCE_TIMEOUT", "Inference timed out", 504)
        except ModelUnavailableError as exc:
            _record_stat("denoise", 0, error=True)
            return _error("MODEL_UNAVAILABLE", str(exc), 503)
        except (FileNotFoundError, ValueError):
            _record_stat("denoise", 0, error=True)
            return _error("MODEL_NOT_FOUND", "NAFNet model not found", 400)
        except Exception as exc:
            logger.exception("denoise failed")
            _record_stat("denoise", 0, error=True)
            return _error("INFERENCE_FAILED", str(exc), 500)
        elapsed = int((time.perf_counter() - t0) * 1000)
        _record_stat("denoise", elapsed)
        gpu_profile = result.pop("_gpu_profile", {})
        result["meta"] = _meta(
            "nafnet", result.get("model_name", "nafnet"), elapsed, (w, h), (w, h),
            gpu=gpu_profile,
            **{k: v for k, v in result.get("extra_meta", {}).items()},
        )
        result.pop("extra_meta", None)
        result.pop("model_name", None)
        return result

    @router.post("/colorize", response_model=None)
    async def colorize(req: ColorizeRequest):
        decoded = _validate_and_decode(req.image_b64)
        if isinstance(decoded, JSONResponse):
            return decoded
        image, (w, h) = decoded
        t0 = time.perf_counter()
        try:
            result = await _dedup_run(
                _gpu_run, engines["ddcolor"], req.image_b64,
                image, endpoint="colorize",
                model=req.model, input_size=req.input_size,
            )
        except GpuBusyError:
            _record_stat("colorize", 0, error=True)
            return _error("GPU_BUSY", "All GPU slots occupied, try again later", 503)
        except InferenceTimeoutError:
            _record_stat("colorize", 0, error=True)
            return _error("INFERENCE_TIMEOUT", "Inference timed out", 504)
        except ModelUnavailableError as exc:
            _record_stat("colorize", 0, error=True)
            return _error("MODEL_UNAVAILABLE", str(exc), 503)
        except (FileNotFoundError, ValueError):
            _record_stat("colorize", 0, error=True)
            return _error("MODEL_NOT_FOUND", f"DDColor model '{req.model}' not found", 400)
        except Exception as exc:
            logger.exception("colorize failed")
            _record_stat("colorize", 0, error=True)
            return _error("INFERENCE_FAILED", str(exc), 500)
        elapsed = int((time.perf_counter() - t0) * 1000)
        _record_stat("colorize", elapsed)
        gpu_profile = result.pop("_gpu_profile", {})
        result["meta"] = _meta(
            "ddcolor", f"ddcolor-{req.model}", elapsed, (w, h), (w, h),
            gpu=gpu_profile,
            **{k: v for k, v in result.get("extra_meta", {}).items()},
        )
        result.pop("extra_meta", None)
        return result

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

        t0 = time.perf_counter()
        try:
            engine = engines["migan"] if model == "migan" else engines["lama"]
            # LaMa is CPU-only (FFT ops lack CUDA kernels); don't block GPU slots
            run_fn = _cpu_run if model == "lama" else _gpu_run
            result = await run_fn(
                engine, image, endpoint="inpaint",
                mask=mask, dilate_kernel=req.dilate_kernel,
            )
        except GpuBusyError:
            _record_stat("inpaint", 0, error=True)
            return _error("GPU_BUSY", "All GPU slots occupied, try again later", 503)
        except InferenceTimeoutError:
            _record_stat("inpaint", 0, error=True)
            return _error("INFERENCE_TIMEOUT", "Inference timed out", 504)
        except ModelUnavailableError as exc:
            _record_stat("inpaint", 0, error=True)
            return _error("MODEL_UNAVAILABLE", str(exc), 503)
        except (FileNotFoundError, ValueError):
            _record_stat("inpaint", 0, error=True)
            return _error("MODEL_NOT_FOUND", f"Inpaint model '{model}' not found", 400)
        except Exception as exc:
            logger.exception("inpaint failed")
            _record_stat("inpaint", 0, error=True)
            return _error("INFERENCE_FAILED", str(exc), 500)
        elapsed = int((time.perf_counter() - t0) * 1000)
        _record_stat("inpaint", elapsed)
        gpu_profile = result.pop("_gpu_profile", {})
        mask_ratio = float(np.sum(mask > 127) / mask.size)
        result["meta"] = _meta(
            model, model, elapsed, (w, h), (w, h),
            gpu=gpu_profile,
            model_used=model,
            mask_area_ratio=round(mask_ratio, 4),
            dilate_applied=req.dilate_kernel,
        )
        result.pop("extra_meta", None)
        return result

    @router.post("/ocr", response_model=None)
    async def ocr(req: OcrRequest):
        decoded = _validate_and_decode(req.image_b64)
        if isinstance(decoded, JSONResponse):
            return decoded
        image, (w, h) = decoded
        t0 = time.perf_counter()
        try:
            # RapidOCR self-manages sessions on CPU; don't block GPU slots
            result = await _cpu_run(
                engines["rapidocr"], image, endpoint="ocr",
                lang=req.lang, det_only=req.det_only,
                box_thresh=req.box_thresh, text_score=req.text_score,
                return_word_box=req.return_word_box,
            )
        except GpuBusyError:
            _record_stat("ocr", 0, error=True)
            return _error("GPU_BUSY", "All GPU slots occupied, try again later", 503)
        except InferenceTimeoutError:
            _record_stat("ocr", 0, error=True)
            return _error("INFERENCE_TIMEOUT", "Inference timed out", 504)
        except ModelUnavailableError as exc:
            _record_stat("ocr", 0, error=True)
            return _error("MODEL_UNAVAILABLE", str(exc), 503)
        except Exception as exc:
            logger.exception("ocr failed")
            _record_stat("ocr", 0, error=True)
            return _error("INFERENCE_FAILED", str(exc), 500)
        elapsed = int((time.perf_counter() - t0) * 1000)
        _record_stat("ocr", elapsed)
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
        t0 = time.perf_counter()
        try:
            result = await _gpu_run(
                engines["mobilesam"], image, endpoint="segment",
                points=req.points, boxes=req.boxes,
                multimask=req.multimask, mask_input_b64=req.mask_input_b64,
            )
        except GpuBusyError:
            _record_stat("segment", 0, error=True)
            return _error("GPU_BUSY", "All GPU slots occupied, try again later", 503)
        except InferenceTimeoutError:
            _record_stat("segment", 0, error=True)
            return _error("INFERENCE_TIMEOUT", "Inference timed out", 504)
        except ModelUnavailableError as exc:
            _record_stat("segment", 0, error=True)
            return _error("MODEL_UNAVAILABLE", str(exc), 503)
        except Exception as exc:
            logger.exception("segment failed")
            _record_stat("segment", 0, error=True)
            return _error("INFERENCE_FAILED", str(exc), 500)
        elapsed = int((time.perf_counter() - t0) * 1000)
        _record_stat("segment", elapsed)
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

    def get_stats() -> dict[str, Any]:
        """Return per-endpoint inference statistics."""
        result: dict[str, Any] = {}
        for ep, s in _stats.items():
            avg_ms = s.total_ms // s.calls if s.calls > 0 else 0
            result[ep] = {
                "calls": s.calls,
                "errors": s.errors,
                "avg_ms": avg_ms,
                "min_ms": s.min_ms if s.calls > 0 else 0,
                "max_ms": s.max_ms,
                "last_call": s.last_call,
            }
        return result

    def queue_info() -> dict[str, Any]:
        """Return GPU and CPU queue status."""
        return {
            "max_concurrent": settings.max_concurrent,
            "active": settings.max_concurrent - _gpu_sem._value,
            "max_concurrent_cpu": settings.max_concurrent_cpu,
            "active_cpu": settings.max_concurrent_cpu - _cpu_sem._value,
            "timeout_seconds": settings.gpu_queue_timeout,
        }

    def dump_stats() -> dict[str, Any]:
        """Serialize endpoint stats for persistence."""
        return {ep: dataclasses.asdict(s) for ep, s in _stats.items()}

    def load_stats(data: dict[str, Any]) -> None:
        """Restore endpoint stats from saved data."""
        for ep, values in data.items():
            try:
                _stats[ep] = EndpointStats(**values)
            except (TypeError, ValueError):
                logger.warning("Skipping invalid stats for endpoint %s", ep)

    return CortexRouter(
        router=router,
        get_stats=get_stats,
        queue_info=queue_info,
        dump_stats=dump_stats,
        load_stats=load_stats,
    )
