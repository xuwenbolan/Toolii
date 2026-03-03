"""ONNX Runtime model manager with LRU eviction and VRAM budget."""
from __future__ import annotations

import logging
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import onnxruntime as ort

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class ModelInfo:
    name: str
    onnx_path: Path
    vram_mb: int
    required: bool = True


@dataclass
class LoadedModel:
    session: ort.InferenceSession
    info: ModelInfo
    last_used: float = field(default_factory=time.time)


class OnnxModelManager:
    """Manages ONNX Runtime sessions with LRU eviction and VRAM budget.

    - Lazy loading: models load on first request, not at startup
    - LRU eviction: if VRAM budget exceeded, evict least-recently-used
    - OOM recovery: catch CUDA OOM, evict least-used, retry once
    - Fine-grained locking: reads are lock-free, only loading acquires the lock
    """

    def __init__(self) -> None:
        self._models: OrderedDict[str, LoadedModel] = OrderedDict()
        self._lock = threading.Lock()
        self._registry: dict[str, ModelInfo] = {}

    def register(self, info: ModelInfo) -> None:
        self._registry[info.name] = info

    def register_many(self, infos: list[ModelInfo]) -> None:
        for info in infos:
            self.register(info)

    def _create_session(self, model_path: Path) -> ort.InferenceSession:
        sess_opts = ort.SessionOptions()
        sess_opts.enable_mem_pattern = True
        sess_opts.enable_mem_reuse = True
        sess_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        cuda_options: dict[str, Any] = {
            "device_id": 0,
            "arena_extend_strategy": "kSameAsRequested",
            "cudnn_conv_algo_search": "HEURISTIC",
        }
        providers = [("CUDAExecutionProvider", cuda_options), "CPUExecutionProvider"]
        return ort.InferenceSession(str(model_path), sess_options=sess_opts, providers=providers)

    def _estimated_vram(self) -> int:
        return sum(m.info.vram_mb for m in self._models.values())

    def _evict_lru(self, needed_mb: int) -> None:
        """Evict least-recently-used models until there is room for needed_mb."""
        while self._estimated_vram() + needed_mb > settings.vram_budget_mb and self._models:
            oldest_name, oldest = next(iter(self._models.items()))
            logger.info("Evicting model %s to free ~%dMB VRAM", oldest_name, oldest.info.vram_mb)
            del self._models[oldest_name]

    def get_session(self, model_name: str) -> ort.InferenceSession:
        """Load model if not loaded, evict LRU if over budget.

        Fast path (already loaded) is lock-free.
        Slow path (loading) acquires the lock and rechecks.
        """
        # Fast path: model already loaded, no lock needed
        loaded = self._models.get(model_name)
        if loaded is not None:
            loaded.last_used = time.time()
            self._models.move_to_end(model_name)
            return loaded.session

        # Slow path: acquire lock, load model
        with self._lock:
            # Re-check after acquiring lock (another thread may have loaded it)
            loaded = self._models.get(model_name)
            if loaded is not None:
                loaded.last_used = time.time()
                self._models.move_to_end(model_name)
                return loaded.session

            info = self._registry.get(model_name)
            if info is None:
                raise ValueError(f"Unknown model: {model_name}")

            if not info.onnx_path.exists():
                raise FileNotFoundError(f"Model file not found: {info.onnx_path}")

            self._evict_lru(info.vram_mb)

            try:
                session = self._create_session(info.onnx_path)
            except RuntimeError as exc:
                # OOM recovery: catch CUDA/ONNX runtime errors, evict one more and retry
                if self._models:
                    oldest_name = next(iter(self._models))
                    logger.warning("Runtime error loading %s (%s), evicting %s and retrying",
                                   model_name, exc, oldest_name)
                    del self._models[oldest_name]
                    session = self._create_session(info.onnx_path)
                else:
                    raise

            self._models[model_name] = LoadedModel(session=session, info=info)
            logger.info("Loaded model %s (~%dMB, total VRAM ~%dMB)",
                        model_name, info.vram_mb, self._estimated_vram())
            return session

    def warmup(self, required_only: bool = True) -> None:
        """Pre-load models so first requests don't pay loading latency.

        Args:
            required_only: If True, only load models marked as required.
        """
        for name, info in self._registry.items():
            if required_only and not info.required:
                continue
            if not info.onnx_path.exists():
                logger.warning("Skipping warmup for %s: file not found", name)
                continue
            try:
                self.get_session(name)
            except Exception:
                logger.warning("Warmup failed for %s", name, exc_info=True)

    def unload(self, model_name: str) -> None:
        """Manually unload a model."""
        with self._lock:
            self._models.pop(model_name, None)

    def unload_all(self) -> None:
        """Unload all models and release ONNX sessions."""
        with self._lock:
            names = list(self._models.keys())
            self._models.clear()
        if names:
            logger.info("Unloaded %d models: %s", len(names), names)

    # ── Idle eviction ────────────────────────────────────────────────

    def start_idle_evictor(self, idle_minutes: int, check_interval: int = 60) -> None:
        """Start a daemon thread that evicts non-required models idle beyond threshold.

        Args:
            idle_minutes: Evict optional models idle longer than this (0 = disabled).
            check_interval: Seconds between eviction sweeps.
        """
        if idle_minutes <= 0:
            return
        self._idle_threshold = idle_minutes * 60
        t = threading.Thread(
            target=self._evict_idle_loop,
            args=(check_interval,),
            daemon=True,
            name="idle-evictor",
        )
        t.start()
        logger.info("Idle evictor started (threshold=%dm, interval=%ds)", idle_minutes, check_interval)

    def _evict_idle_loop(self, interval: int) -> None:
        while True:
            time.sleep(interval)
            self._evict_idle()

    def _evict_idle(self) -> None:
        """Evict non-required models that exceeded the idle threshold."""
        now = time.time()
        with self._lock:
            to_evict = [
                name for name, loaded in self._models.items()
                if not loaded.info.required
                and (now - loaded.last_used) > self._idle_threshold
            ]
            for name in to_evict:
                idle_sec = now - self._models[name].last_used
                logger.info("Idle-evicting model %s (idle %.0fs)", name, idle_sec)
                del self._models[name]

    def stats(self) -> dict[str, Any]:
        """Return loaded models, VRAM usage, etc. for /health."""
        with self._lock:
            return {
                "loaded": list(self._models.keys()),
                "available": list(self._registry.keys()),
                "vram_estimated_mb": self._estimated_vram(),
            }

    def check_model(self, model_name: str) -> dict[str, Any]:
        """Validate a single model and return diagnostic info.

        For loaded models: inspect the live session.
        For unloaded models: attempt a CPU-only load to verify the file,
        then discard the session (no VRAM cost).
        """
        info = self._registry.get(model_name)
        if info is None:
            return {"name": model_name, "healthy": False, "error": "not_registered"}

        result: dict[str, Any] = {
            "name": model_name,
            "required": info.required,
            "vram_mb": info.vram_mb,
            "path": str(info.onnx_path),
        }

        if not info.onnx_path.exists():
            result.update(healthy=False, error="file_not_found")
            return result

        stat = info.onnx_path.stat()
        result["file_size_mb"] = round(stat.st_size / 1024 / 1024, 1)

        if stat.st_size == 0:
            result.update(healthy=False, error="file_empty")
            return result

        # If already loaded, inspect the live session
        loaded = self._models.get(model_name)
        if loaded is not None:
            session = loaded.session
            result.update(
                healthy=True,
                status="loaded",
                idle_seconds=int(time.time() - loaded.last_used),
                inputs=[{"name": i.name, "shape": i.shape, "dtype": i.type}
                        for i in session.get_inputs()],
                outputs=[{"name": o.name, "shape": o.shape, "dtype": o.type}
                         for o in session.get_outputs()],
                providers=session.get_providers(),
            )
            return result

        # Not loaded: try CPU-only session to validate the ONNX file
        try:
            sess_opts = ort.SessionOptions()
            sess_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_DISABLE_ALL
            session = ort.InferenceSession(
                str(info.onnx_path),
                sess_options=sess_opts,
                providers=["CPUExecutionProvider"],
            )
            result.update(
                healthy=True,
                status="available",
                inputs=[{"name": i.name, "shape": i.shape, "dtype": i.type}
                        for i in session.get_inputs()],
                outputs=[{"name": o.name, "shape": o.shape, "dtype": o.type}
                         for o in session.get_outputs()],
            )
            del session
        except Exception as exc:
            result.update(healthy=False, error="invalid_onnx", detail=str(exc))

        return result

    def check_all(self) -> dict[str, Any]:
        """Run health check on all registered models."""
        results = []
        healthy_count = 0
        for name in self._registry:
            check = self.check_model(name)
            results.append(check)
            if check.get("healthy"):
                healthy_count += 1
        total = len(self._registry)
        return {
            "healthy": healthy_count == total,
            "healthy_count": healthy_count,
            "total": total,
            "models": results,
        }

    def detailed_stats(self) -> dict[str, Any]:
        """Return per-model details for the /models management endpoint."""
        now = time.time()
        models = []

        with self._lock:
            for name, info in self._registry.items():
                loaded = self._models.get(name)
                file_exists = info.onnx_path.exists()
                file_size_mb = round(info.onnx_path.stat().st_size / 1024 / 1024, 1) \
                    if file_exists else None

                entry: dict[str, Any] = {
                    "name": name,
                    "status": "loaded" if loaded else ("available" if file_exists else "missing"),
                    "required": info.required,
                    "vram_mb": info.vram_mb,
                    "file_size_mb": file_size_mb,
                    "path": str(info.onnx_path),
                }
                if loaded:
                    idle = now - loaded.last_used
                    entry["last_used"] = loaded.last_used
                    entry["idle_seconds"] = int(idle)

                models.append(entry)

            loaded_count = len(self._models)
            vram_used = self._estimated_vram()

        return {
            "summary": {
                "registered": len(self._registry),
                "loaded": loaded_count,
                "vram_used_mb": vram_used,
                "vram_budget_mb": settings.vram_budget_mb,
                "vram_utilization": round(vram_used / settings.vram_budget_mb, 3)
                    if settings.vram_budget_mb > 0 else 0,
            },
            "models": models,
        }
