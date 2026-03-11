"""Model loading, unloading, VRAM management, and eviction logic."""
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
from app.model_registry import ModelDisabledError, ModelEvent, ModelInfo

logger = logging.getLogger(__name__)


@dataclass
class LoadedModel:
    session: ort.InferenceSession
    info: ModelInfo
    last_used: float = field(default_factory=time.time)
    loaded_at: float = field(default_factory=time.time)
    load_time_ms: int = 0
    vram_delta_mb: int = 0
    workspace_measured_mb: int = 0   # runtime measured workspace
    inference_count: int = 0


class ModelLoaderMixin:
    """Mixin that provides model loading, eviction, and VRAM management.

    Expects the host class to have:
      - _models: OrderedDict[str, LoadedModel]
      - _lock: threading.Lock
      - _registry: dict[str, ModelInfo]
      - _vram_budget_mb: int
      - _idle_threshold: int
      - _events: deque[ModelEvent]
      - _profile_data: dict[str, dict[str, Any]]
      - _circuit: dict  (for circuit breaker access)
      - _check_circuit(name): from health mixin
      - _record_load_success(name): from health mixin
      - _record_load_failure(name, error): from health mixin
    """

    # -- Session creation ------------------------------------------------------

    @staticmethod
    def _create_session(model_path: Path, cpu_only: bool = False) -> ort.InferenceSession:
        sess_opts = ort.SessionOptions()
        sess_opts.enable_mem_pattern = True
        sess_opts.enable_mem_reuse = True
        sess_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        if cpu_only:
            providers: list[Any] = ["CPUExecutionProvider"]
        else:
            cuda_options: dict[str, Any] = {
                "device_id": 0,
                "arena_extend_strategy": "kSameAsRequested",
                "cudnn_conv_algo_search": "HEURISTIC",
            }
            providers = [("CUDAExecutionProvider", cuda_options), "CPUExecutionProvider"]
        return ort.InferenceSession(str(model_path), sess_options=sess_opts, providers=providers)

    # -- VRAM estimation -------------------------------------------------------

    def _estimated_vram(self) -> int:
        """Sum of loaded models' measured VRAM (fallback to estimate)."""
        return sum(m.vram_delta_mb or m.info.vram_mb for m in self._models.values())

    # -- Eviction --------------------------------------------------------------

    def _evict_model(self, name: str, reason: str = "evicted_lru") -> None:
        """Evict a model: delete session, gc.collect to reclaim CUDA memory."""
        loaded = self._models.pop(name, None)
        if loaded is None:
            return
        delta = loaded.vram_delta_mb
        vram_before = gpu.vram_used_mb()
        del loaded.session
        del loaded
        gc.collect()
        vram_after = gpu.vram_used_mb()
        freed = max(0, vram_before - vram_after)
        logger.info("Evicted model %s [%s] (tracked %dMB, freed ~%dMB, VRAM %dMB -> %dMB)",
                     name, reason, delta, freed, vram_before, vram_after)
        self._events.append(ModelEvent(
            timestamp=time.time(), event=reason, model=name,
            vram_before_mb=vram_before, vram_after_mb=vram_after,
            detail=f"tracked={delta}MB freed={freed}MB",
        ))

    def _eviction_score(self, name: str) -> float:
        """Higher score = better eviction candidate.

        Score = vram_freed / (reload_cost * usage_recency)
        - Large VRAM models free more space (good to evict)
        - Slow-loading models are expensive to reload (bad to evict)
        - Frequently/recently used models should stay loaded (bad to evict)
        """
        loaded = self._models[name]
        vram = max(loaded.vram_delta_mb, loaded.info.vram_mb, 1)
        load_ms = max(loaded.load_time_ms, 100)  # floor to avoid division issues
        # Recency: seconds since last use, clamped to [1, 3600]
        idle_sec = max(1.0, min(3600.0, time.time() - loaded.last_used))
        # Frequency: inference count, clamped to [1, ...)
        freq = max(1, loaded.inference_count)
        # Score: prefer models that free lots of VRAM, are cheap to reload,
        # idle for a long time, and rarely used
        return (vram * idle_sec) / (load_ms * freq)

    def _find_eviction_candidate(self, exclude: str = "") -> str | None:
        """Find best eviction candidate using weighted scoring.

        Prefers non-required models. Among candidates of the same class,
        picks the one with the highest eviction score (large VRAM, cheap
        to reload, idle, infrequently used).
        """
        non_required = [
            n for n in self._models
            if n != exclude and not self._models[n].info.required
        ]
        if non_required:
            return max(non_required, key=self._eviction_score)
        required = [n for n in self._models if n != exclude]
        if required:
            return max(required, key=self._eviction_score)
        return None

    def _evict_lru_by_estimate(self, needed_mb: int) -> None:
        """Pre-load heuristic: evict LRU models based on estimates before loading."""
        while self._estimated_vram() + needed_mb > self._vram_budget_mb and self._models:
            victim = self._find_eviction_candidate()
            if victim is None:
                break
            logger.info("Pre-evicting model %s (estimated VRAM pressure)", victim)
            self._evict_model(victim)

    def _evict_until_under_budget(self, exclude: str = "") -> None:
        """Post-load: evict LRU models until real VRAM is under budget."""
        max_rounds = len(self._models)
        for _ in range(max_rounds):
            real_vram = gpu.vram_used_mb()
            if real_vram <= self._vram_budget_mb:
                return
            victim = self._find_eviction_candidate(exclude=exclude)
            if victim is None:
                logger.warning("VRAM %dMB > budget %dMB but no models to evict",
                               real_vram, self._vram_budget_mb)
                return
            logger.info("VRAM %dMB > budget %dMB, evicting LRU model %s",
                         real_vram, self._vram_budget_mb, victim)
            self._evict_model(victim, reason="evicted_budget")
            time.sleep(0.1)

    def _ensure_workspace_headroom(self, model_name: str) -> None:
        """Evict other models to ensure enough free VRAM for inference workspace.

        Ensures: vram_used + workspace + safety <= vram_total (physical).
        """
        loaded = self._models.get(model_name)
        if loaded is None:
            return

        needed = loaded.workspace_measured_mb or loaded.info.workspace_mb
        if needed <= 0:
            return

        total = gpu.vram_total_mb()
        safety = 500
        max_used = total - needed - safety

        real = gpu.vram_used_mb()
        if real <= max_used:
            return

        logger.info("Workspace headroom: need %dMB free for %s, VRAM %dMB/%dMB, evicting...",
                     needed + safety, model_name, real, total)
        for name in list(self._models):
            if name == model_name:
                continue
            if real <= max_used:
                break
            self._evict_model(name, reason="evicted_workspace")
            time.sleep(0.1)
            real = gpu.vram_used_mb()

    # -- Session retrieval (main load path) ------------------------------------

    def get_session(self, model_name: str) -> ort.InferenceSession:
        """Load model if not loaded, evict LRU if over budget.

        Flow:
        1. Check circuit breaker
        2. Already loaded -> ensure workspace headroom, return
        3. Pre-evict based on estimates
        4. Load model (loop-evict on OOM)
        5. Post-load: enforce real VRAM budget
        6. Ensure workspace headroom for inference
        """
        with self._lock:
            self._check_circuit(model_name)

            info = self._registry.get(model_name)
            if info is None:
                raise ValueError(f"Unknown model: {model_name}")
            if not info.enabled:
                raise ModelDisabledError(f"Model '{model_name}' is disabled by admin")

            loaded = self._models.get(model_name)
            if loaded is not None:
                loaded.last_used = time.time()
                self._models.move_to_end(model_name)
                self._ensure_workspace_headroom(model_name)
                return loaded.session

            if not info.onnx_path.exists():
                raise FileNotFoundError(f"Model file not found: {info.onnx_path}")

            # Pre-evict based on estimates
            if not info.cpu_only:
                self._evict_lru_by_estimate(info.vram_mb)

            vram_before = gpu.vram_used_mb()
            t_load = time.perf_counter()
            session: ort.InferenceSession | None = None
            last_exc: RuntimeError | None = None
            # OOM recovery loop: evict candidates one at a time until load succeeds
            for _attempt in range(len(self._models) + 1):
                try:
                    session = self._create_session(info.onnx_path, cpu_only=info.cpu_only)
                    last_exc = None
                    break
                except RuntimeError as exc:
                    last_exc = exc
                    if info.cpu_only:
                        break
                    victim = self._find_eviction_candidate(exclude=model_name)
                    if victim is None:
                        break
                    logger.warning("OOM loading %s (%s), evicting %s and retrying",
                                   model_name, exc, victim)
                    self._events.append(ModelEvent(
                        timestamp=time.time(), event="oom_retry", model=model_name,
                        vram_before_mb=gpu.vram_used_mb(), vram_after_mb=0,
                        detail=f"evicting {victim}: {exc}",
                    ))
                    self._evict_model(victim)
                    vram_before = gpu.vram_used_mb()
                    t_load = time.perf_counter()
            if session is None:
                self._record_load_failure(model_name, str(last_exc))
                raise last_exc  # type: ignore[misc]

            self._record_load_success(model_name)
            load_time_ms = int((time.perf_counter() - t_load) * 1000)
            vram_after = gpu.vram_used_mb()
            vram_delta = max(0, vram_after - vram_before)

            now = time.time()
            self._models[model_name] = LoadedModel(
                session=session, info=info, last_used=now,
                loaded_at=now, load_time_ms=load_time_ms,
                vram_delta_mb=vram_delta,
            )
            provider_label = "cpu-only" if info.cpu_only else "gpu"
            logger.info("Loaded model %s [%s] (est ~%dMB, delta ~%dMB, real VRAM %dMB/%dMB, "
                        "workspace ~%dMB, load %dms, %d models loaded)",
                        model_name, provider_label, info.vram_mb, vram_delta,
                        vram_after, self._vram_budget_mb, info.workspace_mb,
                        load_time_ms, len(self._models))
            self._events.append(ModelEvent(
                timestamp=now, event="loaded", model=model_name,
                vram_before_mb=vram_before, vram_after_mb=vram_after,
                detail=f"est={info.vram_mb}MB delta={vram_delta}MB "
                       f"workspace={info.workspace_mb}MB load={load_time_ms}ms "
                       f"provider={provider_label}",
            ))

            if not info.cpu_only:
                # Post-load: enforce real VRAM budget
                self._evict_until_under_budget(exclude=model_name)

                # Ensure workspace headroom for inference
                self._ensure_workspace_headroom(model_name)

            return session

    # -- Post-inference tracking -----------------------------------------------

    def post_inference_check(self, vram_before: int, vram_after: int) -> None:
        """Called after inference to track workspace and enforce budget.

        Updates workspace_measured_mb for the most recently used model.
        Triggers eviction if VRAM exceeds budget.
        """
        workspace_delta = max(0, vram_after - vram_before)

        # Update workspace measurement for the most recently used model
        with self._lock:
            if self._models:
                # Most recently used model is at the end of OrderedDict
                last_name = next(reversed(self._models))
                loaded = self._models[last_name]
                loaded.inference_count += 1

                if workspace_delta > 0:
                    profile_ws = self._profile_data.get(last_name, {}).get(
                        "workspace_peak_mb", 0)
                    if profile_ws > 0:
                        # Has profile data: only update if runtime exceeds profile by > 20%
                        if workspace_delta > profile_ws * 1.2:
                            loaded.workspace_measured_mb = workspace_delta
                            loaded.info.workspace_mb = workspace_delta
                            logger.warning(
                                "Runtime workspace for %s (%dMB) exceeds profile (%dMB)",
                                last_name, workspace_delta, profile_ws)
                            self._events.append(ModelEvent(
                                timestamp=time.time(), event="workspace_warning",
                                model=last_name,
                                vram_before_mb=vram_before, vram_after_mb=vram_after,
                                detail=f"runtime={workspace_delta}MB profile={profile_ws}MB",
                            ))
                    elif loaded.inference_count <= 1:
                        # No profile, first inference: set workspace
                        loaded.workspace_measured_mb = workspace_delta
                        loaded.info.workspace_mb = max(
                            loaded.info.workspace_mb, workspace_delta)
                        logger.info(
                            "First inference workspace for %s: %dMB (retained)",
                            last_name, workspace_delta)
                    elif workspace_delta > loaded.workspace_measured_mb:
                        # No profile, subsequent inference exceeds previous: update
                        loaded.workspace_measured_mb = workspace_delta
                        loaded.info.workspace_mb = max(
                            loaded.info.workspace_mb, workspace_delta)

            # Post-inference budget enforcement (evict until under budget)
            if self._models:
                last_name = next(reversed(self._models))
                self._evict_until_under_budget(exclude=last_name)

    # -- Warmup / Unload -------------------------------------------------------

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
            to_evict = [
                name for name, loaded in self._models.items()
                if not loaded.info.required
                and self._idle_threshold > 0
                and (now - loaded.last_used) > self._idle_threshold
            ]
            for name in to_evict:
                idle_sec = now - self._models[name].last_used
                logger.info("Idle-evicting model %s (idle %.0fs)", name, idle_sec)
                self._evict_model(name, reason="evicted_idle")

            real_vram = gpu.vram_used_mb()
            while real_vram > self._vram_budget_mb and self._models:
                victim = self._find_eviction_candidate()
                if victim is None:
                    break
                logger.info("VRAM sweep: %dMB > budget %dMB, evicting %s",
                            real_vram, self._vram_budget_mb, victim)
                self._evict_model(victim, reason="evicted_budget")
                time.sleep(0.1)
                real_vram = gpu.vram_used_mb()

    # -- Profile ---------------------------------------------------------------

    def profile_model(
        self,
        model_name: str,
        run_fn: Any,
        sample_interval: float = 0.05,
    ) -> dict[str, Any]:
        """Profile a single model in isolation.

        1. Unload all models
        2. Wait for CUDA cleanup
        3. Record baseline
        4. Load model
        5. Start VRAM sampler
        6. Run inference
        7. Compute workspace metrics
        """
        info = self._registry.get(model_name)
        if info is None:
            return {"model": model_name, "error": "not_registered"}
        if not info.onnx_path.exists():
            return {"model": model_name, "error": "file_not_found"}

        with self._lock:
            names = list(self._models.keys())
            for n in names:
                self._evict_model(n)
        time.sleep(1.0)
        gc.collect()

        baseline_vram = gpu.vram_used_mb()
        baseline_ram = gpu.system_ram_used_mb()

        # Load model
        session = self._create_session(info.onnx_path, cpu_only=info.cpu_only)
        time.sleep(0.2)
        post_load_vram = gpu.vram_used_mb()
        load_vram = max(0, post_load_vram - baseline_vram)

        # Sample VRAM during inference
        peak_vram = [post_load_vram]
        stop_event = threading.Event()

        def sampler() -> None:
            while not stop_event.is_set():
                v = gpu.vram_used_mb()
                if v > peak_vram[0]:
                    peak_vram[0] = v
                stop_event.wait(sample_interval)

        sampler_thread = threading.Thread(target=sampler, daemon=True)
        sampler_thread.start()

        try:
            run_fn(session)
        finally:
            stop_event.set()
            sampler_thread.join(timeout=2)

        post_inference_vram = gpu.vram_used_mb()
        post_inference_ram = gpu.system_ram_used_mb()

        # Cleanup
        del session
        gc.collect()
        time.sleep(0.5)

        workspace_peak = max(0, peak_vram[0] - baseline_vram - load_vram)
        workspace_retained = max(0, post_inference_vram - post_load_vram)
        # Sampling may miss short-lived peaks; retained is a guaranteed lower bound
        workspace_peak = max(workspace_peak, workspace_retained)
        ram_delta = max(0, post_inference_ram - baseline_ram)

        file_size_mb = round(info.onnx_path.stat().st_size / (1024 * 1024), 1)

        return {
            "model": model_name,
            "file_size_mb": file_size_mb,
            "baseline_vram_mb": baseline_vram,
            "load_vram_mb": load_vram,
            "inference_peak_mb": max(0, peak_vram[0] - baseline_vram),
            "workspace_peak_mb": workspace_peak,
            "workspace_retained_mb": workspace_retained,
            "system_ram_delta_mb": ram_delta,
            "shared_memory_detected": (
                peak_vram[0] >= gpu.vram_total_mb() * 0.98 or ram_delta > 500
            ),
        }
