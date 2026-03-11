"""Circuit breaker, health checks, and error tracking for models."""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any

import onnxruntime as ort

from app import gpu
from app.model_registry import ModelEvent

logger = logging.getLogger(__name__)

_CIRCUIT_BREAKER_THRESHOLD = 3       # consecutive failures to trip
_CIRCUIT_BREAKER_COOLDOWN = 60.0     # seconds before half-open retry


class CircuitBreakerOpen(RuntimeError):
    """Raised when a model's circuit breaker is tripped."""


@dataclass
class _CircuitState:
    failures: int = 0
    tripped_at: float = 0.0          # 0 = not tripped
    last_error: str = ""


class ModelHealthMixin:
    """Mixin that provides circuit breaker, health checks, and stats.

    Expects the host class to have:
      - _models: OrderedDict[str, LoadedModel]
      - _lock: threading.Lock
      - _registry: dict[str, ModelInfo]
      - _vram_budget_mb: int
      - _events: deque[ModelEvent]
      - _circuit: dict[str, _CircuitState]
      - _profile_data: dict[str, dict[str, Any]]
      - _estimated_vram(): int  (from loader mixin)
    """

    # -- Circuit breaker -------------------------------------------------------

    def _check_circuit(self, model_name: str) -> None:
        """Raise RuntimeError if circuit breaker is tripped and cooldown not elapsed."""
        cb = self._circuit.get(model_name)
        if cb is None or cb.tripped_at == 0:
            return
        elapsed = time.time() - cb.tripped_at
        if elapsed < _CIRCUIT_BREAKER_COOLDOWN:
            raise CircuitBreakerOpen(
                f"Model {model_name} circuit-breaker open "
                f"({cb.failures} consecutive failures, "
                f"retry in {_CIRCUIT_BREAKER_COOLDOWN - elapsed:.0f}s): {cb.last_error}"
            )
        # Half-open: allow one attempt
        logger.info("Circuit breaker half-open for %s, allowing retry", model_name)

    def _record_load_success(self, model_name: str) -> None:
        cb = self._circuit.get(model_name)
        if cb and cb.failures > 0:
            logger.info("Circuit breaker reset for %s after successful load", model_name)
            cb.failures = 0
            cb.tripped_at = 0.0
            cb.last_error = ""

    def _record_load_failure(self, model_name: str, error: str) -> None:
        cb = self._circuit.setdefault(model_name, _CircuitState())
        cb.failures += 1
        cb.last_error = error
        if cb.failures >= _CIRCUIT_BREAKER_THRESHOLD:
            cb.tripped_at = time.time()
            logger.error("Circuit breaker TRIPPED for %s (%d failures): %s",
                         model_name, cb.failures, error)
            self._events.append(ModelEvent(
                timestamp=time.time(), event="circuit_tripped", model=model_name,
                vram_before_mb=gpu.vram_used_mb(), vram_after_mb=gpu.vram_used_mb(),
                detail=f"failures={cb.failures} error={error}",
            ))

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

    # -- Health checks ---------------------------------------------------------

    def check_model(self, model_name: str) -> dict[str, Any]:
        """Validate a single model and return diagnostic info."""
        info = self._registry.get(model_name)
        if info is None:
            return {"name": model_name, "healthy": False, "error": "not_registered"}

        result: dict[str, Any] = {
            "name": model_name,
            "required": info.required,
            "enabled": info.enabled,
            "vram_mb": info.vram_mb,
            "workspace_mb": info.workspace_mb,
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
                vram_delta_mb=loaded.vram_delta_mb,
                workspace_measured_mb=loaded.workspace_measured_mb,
                inference_count=loaded.inference_count,
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

                if loaded:
                    status = "loaded"
                elif not info.enabled:
                    status = "disabled"
                elif file_exists:
                    status = "available"
                else:
                    status = "missing"

                entry: dict[str, Any] = {
                    "name": name,
                    "status": status,
                    "required": info.required,
                    "enabled": info.enabled,
                    "vram_mb": info.vram_mb,
                    "workspace_mb": info.workspace_mb,
                    "file_size_mb": file_size_mb,
                    "path": str(info.onnx_path),
                }
                if loaded:
                    idle = now - loaded.last_used
                    entry["last_used"] = loaded.last_used
                    entry["idle_seconds"] = int(idle)
                    entry["loaded_at"] = loaded.loaded_at
                    entry["load_time_ms"] = loaded.load_time_ms
                    entry["vram_delta_mb"] = loaded.vram_delta_mb
                    entry["workspace_measured_mb"] = loaded.workspace_measured_mb
                    entry["inference_count"] = loaded.inference_count

                models.append(entry)

            loaded_count = len(self._models)
            estimated_vram = self._estimated_vram()
            events = [
                {
                    "timestamp": e.timestamp,
                    "event": e.event,
                    "model": e.model,
                    "vram_before_mb": e.vram_before_mb,
                    "vram_after_mb": e.vram_after_mb,
                    "detail": e.detail,
                }
                for e in self._events
            ]

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
            "events": events,
        }
