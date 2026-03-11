"""GPU/CPU concurrency control, request deduplication, and inference dispatch."""
from __future__ import annotations

import asyncio
import concurrent.futures
import hashlib
import logging
import threading
import time
from collections.abc import Callable
from typing import Any

import numpy as np

from app import gpu
from app.config import settings
from app.engines.base import BaseEngine
from app.model_manager import CircuitBreakerOpen, OnnxModelManager

logger = logging.getLogger(__name__)


# -- Exceptions ----------------------------------------------------------------


class GpuBusyError(Exception):
    """Raised when all GPU inference slots are occupied."""


class InferenceTimeoutError(Exception):
    """Raised when inference exceeds timeout."""


class ModelUnavailableError(Exception):
    """Raised when a model is temporarily unavailable (e.g. circuit breaker)."""


# -- Concurrency manager ------------------------------------------------------


class ConcurrencyManager:
    """Manages GPU/CPU semaphores, thread pool, dedup, and inference dispatch."""

    def __init__(
        self,
        manager: OnnxModelManager,
        timeline: gpu.VramTimeline | None = None,
    ) -> None:
        self._manager = manager
        self._timeline = timeline
        self._gpu_sem = asyncio.Semaphore(settings.max_concurrent)
        self._cpu_sem = asyncio.Semaphore(settings.max_concurrent_cpu)
        self._thread_pool = concurrent.futures.ThreadPoolExecutor(
            max_workers=settings.max_concurrent + 2,  # room for ghost threads
            thread_name_prefix="cortex-infer",
        )
        # In-flight request deduplication: identical requests share the same
        # inference result instead of running twice on the GPU.
        # Only holds entries while inference is running -- NOT a cache.
        self._inflight: dict[str, asyncio.Future] = {}
        self._inflight_lock = asyncio.Lock()

    # -- Queue info ------------------------------------------------------------

    def queue_info(self) -> dict[str, Any]:
        """Return GPU and CPU queue status."""
        return {
            "max_concurrent": settings.max_concurrent,
            "active": settings.max_concurrent - self._gpu_sem._value,
            "max_concurrent_cpu": settings.max_concurrent_cpu,
            "active_cpu": settings.max_concurrent_cpu - self._cpu_sem._value,
            "timeout_seconds": settings.gpu_queue_timeout,
        }

    # -- Dedup key -------------------------------------------------------------

    @staticmethod
    def request_key(endpoint: str, image_b64: str, **params: Any) -> str:
        """Build a dedup key from endpoint + image hash + sorted params.

        Uses incremental hashing, though .encode() still copies the string
        since Python str -> bytes requires encoding.
        """
        h = hashlib.sha256()
        h.update(endpoint.encode())
        h.update(image_b64.encode())
        for k in sorted(params):
            v = params[k]
            # Skip non-hashable params (numpy arrays like mask)
            if isinstance(v, (str, int, float, bool, type(None))):
                h.update(f"{k}={v}".encode())
        return h.hexdigest()

    # -- GPU inference dispatch ------------------------------------------------

    async def gpu_run(
        self,
        engine: BaseEngine,
        image: np.ndarray,
        endpoint: str = "",
        **kwargs: Any,
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
                await self._gpu_sem.acquire()
        except TimeoutError:
            raise GpuBusyError()

        timed_out = False
        try:
            snap_before = gpu.gpu_snapshot()
            vram_before = snap_before.get("vram_used_mb", gpu.vram_used_mb())
            if self._timeline and endpoint:
                self._timeline.mark_event(f"inference:{endpoint}")
            t_infer = time.perf_counter()

            # Submit to a real executor so we get a concurrent.futures.Future
            # that we can wait on from a cleanup thread if timeout fires.
            cf_future: concurrent.futures.Future = self._thread_pool.submit(
                engine.run, self._manager, image, **kwargs,
            )

            try:
                async with asyncio.timeout(settings.inference_timeout):
                    loop = asyncio.get_running_loop()
                    result = await asyncio.wrap_future(cf_future, loop=loop)
            except CircuitBreakerOpen as exc:
                raise ModelUnavailableError(str(exc))
            except TimeoutError:
                timed_out = True
                logger.error(
                    "Inference timeout (%s) after %.0fs",
                    endpoint, settings.inference_timeout,
                )
                # Schedule background cleanup for the orphaned thread.
                # The semaphore is NOT released here -- cleanup releases it
                # once the thread actually finishes.
                self._schedule_ghost_cleanup(cf_future, endpoint, vram_before)
                raise InferenceTimeoutError()

            inference_ms = int((time.perf_counter() - t_infer) * 1000)
            snap_after = gpu.gpu_snapshot()
            vram_after = snap_after.get("vram_used_mb", gpu.vram_used_mb())
            self._manager.post_inference_check(vram_before, vram_after)
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
                self._gpu_sem.release()

    def _schedule_ghost_cleanup(
        self,
        cf_future: concurrent.futures.Future,
        endpoint: str,
        vram_before: int,
    ) -> None:
        """Spawn a daemon thread that waits for a timed-out inference to
        finish, then releases the GPU semaphore and runs VRAM checks.

        asyncio.Semaphore.release() must be called from the event loop thread,
        so we use call_soon_threadsafe to schedule it.
        """
        loop = asyncio.get_running_loop()
        gpu_sem = self._gpu_sem
        manager = self._manager

        def _wait_and_cleanup() -> None:
            try:
                cf_future.result(timeout=600)  # hard cap: 10 min
            except Exception:
                pass
            # Release the GPU slot -- must go through event loop
            loop.call_soon_threadsafe(gpu_sem.release)
            vram_after = gpu.vram_used_mb()
            manager.post_inference_check(vram_before, vram_after)
            logger.info(
                "Ghost inference cleanup (%s): VRAM %dMB -> %dMB",
                endpoint, vram_before, vram_after,
            )

        t = threading.Thread(
            target=_wait_and_cleanup, daemon=True,
            name=f"ghost-cleanup-{endpoint}",
        )
        t.start()

    # -- CPU inference dispatch ------------------------------------------------

    async def cpu_run(
        self,
        engine: BaseEngine,
        image: np.ndarray,
        endpoint: str = "",
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Run CPU-only engine inference without occupying a GPU slot."""
        try:
            async with asyncio.timeout(settings.gpu_queue_timeout):
                await self._cpu_sem.acquire()
        except TimeoutError:
            raise GpuBusyError()
        try:
            if self._timeline and endpoint:
                self._timeline.mark_event(f"inference:{endpoint}")
            t_infer = time.perf_counter()
            try:
                async with asyncio.timeout(settings.inference_timeout):
                    result = await asyncio.to_thread(
                        engine.run, self._manager, image, **kwargs,
                    )
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
            logger.error(
                "CPU inference timeout (%s) after %.0fs",
                endpoint, settings.inference_timeout,
            )
            raise InferenceTimeoutError()
        finally:
            self._cpu_sem.release()

    # -- In-flight dedup wrapper -----------------------------------------------

    async def dedup_run(
        self,
        run_fn: Callable,
        engine: BaseEngine,
        image_b64: str,
        image: np.ndarray,
        endpoint: str,
        **kwargs: Any,
    ) -> dict[str, Any]:
        """Deduplicate identical in-flight requests.

        If another request with the same endpoint + image + params is
        already running, wait for its result instead of running again.
        The first caller drives the actual inference; subsequent callers
        share the result via a shared asyncio.Future.

        NOT a cache -- entries only exist while inference is in progress.
        """
        key = self.request_key(endpoint, image_b64, **kwargs)

        is_driver = False
        async with self._inflight_lock:
            if key in self._inflight:
                shared_future = self._inflight[key]
                logger.debug("Dedup hit for %s (key=%s...)", endpoint, key[:12])
            else:
                shared_future = asyncio.get_running_loop().create_future()
                self._inflight[key] = shared_future
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
                self._inflight.pop(key, None)

        # Non-driver waiters (or driver on success) get the shared result.
        # Driver reaches here only on success; non-drivers always reach here.
        return dict(await shared_future)
