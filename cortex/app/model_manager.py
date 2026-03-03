"""ONNX Runtime model manager with real VRAM monitoring and LRU eviction."""
from __future__ import annotations

import gc
import logging
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import onnxruntime as ort

from app import gpu

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
    """Manages ONNX Runtime sessions with real VRAM monitoring and LRU eviction.

    - Lazy loading: models load on first request, not at startup
    - Real VRAM tracking: uses pynvml to query actual GPU memory
    - LRU eviction: if real VRAM exceeds budget after loading, evict least-recently-used
    - Estimated VRAM used as pre-load heuristic only
    - OOM recovery: catch CUDA OOM, evict least-used, retry once
    """

    def __init__(self, vram_budget_mb: int) -> None:
        self._models: OrderedDict[str, LoadedModel] = OrderedDict()
        self._lock = threading.Lock()
        self._registry: dict[str, ModelInfo] = {}
        self._vram_budget_mb = vram_budget_mb
        self._idle_threshold = 0

    @property
    def vram_budget_mb(self) -> int:
        return self._vram_budget_mb

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

    def _evict_model(self, name: str) -> None:
        """Evict a model: delete session, gc.collect to reclaim CUDA memory."""
        loaded = self._models.pop(name, None)
        if loaded is None:
            return
        vram_before = gpu.vram_used_mb()
        del loaded.session
        del loaded
        gc.collect()
        vram_after = gpu.vram_used_mb()
        freed = max(0, vram_before - vram_after)
        logger.info("Evicted model %s (freed ~%dMB, VRAM %dMB -> %dMB)",
                     name, freed, vram_before, vram_after)

    def _evict_lru_by_estimate(self, needed_mb: int) -> None:
        """Pre-load heuristic: evict LRU models based on estimates before loading."""
        while self._estimated_vram() + needed_mb > self._vram_budget_mb and self._models:
            oldest_name = next(iter(self._models))
            logger.info("Pre-evicting model %s (estimated VRAM pressure)", oldest_name)
            self._evict_model(oldest_name)

    def _evict_until_under_budget(self, exclude: str) -> None:
        """Post-load: evict LRU models until real VRAM is under budget."""
        max_rounds = len(self._models)
        for _ in range(max_rounds):
            real_vram = gpu.vram_used_mb()
            if real_vram <= self._vram_budget_mb:
                return
            # Find oldest model that is not the one we just loaded
            victim = None
            for name in self._models:
                if name != exclude:
                    victim = name
                    break
            if victim is None:
                logger.warning("VRAM %dMB > budget %dMB but no models to evict",
                               real_vram, self._vram_budget_mb)
                return
            logger.info("VRAM %dMB > budget %dMB, evicting LRU model %s",
                         real_vram, self._vram_budget_mb, victim)
            self._evict_model(victim)
            time.sleep(0.1)  # brief pause for CUDA memory to settle

    def get_session(self, model_name: str) -> ort.InferenceSession:
        """Load model if not loaded, evict LRU if over budget.

        Flow:
        1. Fast path: already loaded, return session
        2. Pre-evict based on estimates (avoid obviously wasteful loads)
        3. Load model
        4. Post-load: check real VRAM, evict LRU until under budget
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

            # Pre-evict based on estimates
            self._evict_lru_by_estimate(info.vram_mb)

            try:
                session = self._create_session(info.onnx_path)
            except RuntimeError as exc:
                # OOM recovery: evict one more and retry
                if self._models:
                    oldest_name = next(iter(self._models))
                    logger.warning("OOM loading %s (%s), evicting %s and retrying",
                                   model_name, exc, oldest_name)
                    self._evict_model(oldest_name)
                    session = self._create_session(info.onnx_path)
                else:
                    raise

            self._models[model_name] = LoadedModel(session=session, info=info)
            real_vram = gpu.vram_used_mb()
            logger.info("Loaded model %s (est ~%dMB, real VRAM %dMB/%dMB, %d models loaded)",
                        model_name, info.vram_mb, real_vram, self._vram_budget_mb,
                        len(self._models))

            # Post-load: enforce real VRAM budget
            self._evict_until_under_budget(exclude=model_name)

            return session

    def warmup(self, required_only: bool = True) -> None:
        """Pre-load models so first requests don't pay loading latency."""
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
            self._evict_model(model_name)

    def unload_all(self) -> None:
        """Unload all models and release ONNX sessions."""
        with self._lock:
            names = list(self._models.keys())
            for name in names:
                self._evict_model(name)
        if names:
            logger.info("Unloaded %d models: %s", len(names), names)

    # -- Idle eviction ---------------------------------------------------------

    def start_idle_evictor(self, idle_minutes: int, check_interval: int = 60) -> None:
        """Start a daemon thread that evicts non-required models idle beyond threshold.

        Also enforces real VRAM budget on each sweep.
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
        logger.info("Idle evictor started (threshold=%dm, interval=%ds)",
                     idle_minutes, check_interval)

    def _evict_idle_loop(self, interval: int) -> None:
        while True:
            time.sleep(interval)
            self._evict_idle()

    def _evict_idle(self) -> None:
        """Evict idle models and enforce real VRAM budget."""
        now = time.time()
        with self._lock:
            # Evict idle non-required models
            to_evict = [
                name for name, loaded in self._models.items()
                if not loaded.info.required
                and self._idle_threshold > 0
                and (now - loaded.last_used) > self._idle_threshold
            ]
            for name in to_evict:
                idle_sec = now - self._models[name].last_used
                logger.info("Idle-evicting model %s (idle %.0fs)", name, idle_sec)
                self._evict_model(name)

            # Also enforce real VRAM budget
            real_vram = gpu.vram_used_mb()
            while real_vram > self._vram_budget_mb and self._models:
                oldest_name = next(iter(self._models))
                logger.info("VRAM sweep: %dMB > budget %dMB, evicting %s",
                            real_vram, self._vram_budget_mb, oldest_name)
                self._evict_model(oldest_name)
                time.sleep(0.1)
                real_vram = gpu.vram_used_mb()

    # -- Stats -----------------------------------------------------------------

    def stats(self) -> dict[str, Any]:
        """Return loaded models, VRAM usage for /health."""
        with self._lock:
            return {
                "loaded": list(self._models.keys()),
                "available": list(self._registry.keys()),
                "vram_estimated_mb": self._estimated_vram(),
                "vram_real_mb": gpu.vram_used_mb(),
                "vram_budget_mb": self._vram_budget_mb,
            }

    def check_model(self, model_name: str) -> dict[str, Any]:
        """Validate a single model and return diagnostic info."""
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
        real_vram = gpu.vram_used_mb()

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
            estimated_vram = self._estimated_vram()

        return {
            "summary": {
                "registered": len(self._registry),
                "loaded": loaded_count,
                "vram_estimated_mb": estimated_vram,
                "vram_real_mb": real_vram,
                "vram_budget_mb": self._vram_budget_mb,
                "vram_utilization": round(real_vram / self._vram_budget_mb, 3)
                    if self._vram_budget_mb > 0 else 0,
            },
            "models": models,
        }
