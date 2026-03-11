"""ONNX Runtime model manager with real VRAM monitoring and LRU eviction.

This module is the main orchestrator.  Implementation is split across:
  - model_registry: registration, discovery, configuration, state persistence
  - model_loader: loading, unloading, VRAM management, eviction
  - model_health: circuit breaker, health checks, error tracking

All public names are re-exported here for backward compatibility.
"""
from __future__ import annotations

import threading
from collections import OrderedDict, deque
from pathlib import Path
from typing import Any

from app.model_health import CircuitBreakerOpen, ModelHealthMixin, _CircuitState
from app.model_loader import LoadedModel, ModelLoaderMixin
from app.model_registry import ModelDisabledError, ModelEvent, ModelInfo, ModelRegistryMixin

# Re-export for backward compatibility
__all__ = [
    "CircuitBreakerOpen",
    "LoadedModel",
    "ModelDisabledError",
    "ModelEvent",
    "ModelInfo",
    "OnnxModelManager",
]


class OnnxModelManager(ModelRegistryMixin, ModelLoaderMixin, ModelHealthMixin):
    """Manages ONNX Runtime sessions with real VRAM monitoring and LRU eviction.

    - Lazy loading: models load on first request, not at startup
    - Real VRAM tracking: uses pynvml to query actual GPU memory
    - LRU eviction: if real VRAM exceeds budget after loading, evict least-recently-used
    - Workspace headroom: before returning session, ensure free VRAM for inference
    - OOM recovery: catch CUDA OOM, evict candidates in a loop until success
    - Circuit breaker: temporarily disable models that fail to load repeatedly
    """

    def __init__(self, vram_budget_mb: int, data_dir: Path | None = None) -> None:
        self._models: OrderedDict[str, LoadedModel] = OrderedDict()
        self._lock = threading.Lock()
        self._registry: dict[str, ModelInfo] = {}
        self._vram_budget_mb = vram_budget_mb
        self._idle_threshold = 0
        self._events: deque[ModelEvent] = deque(maxlen=200)
        self._profile_data: dict[str, dict[str, Any]] = {}
        self._circuit: dict[str, _CircuitState] = {}
        self._state_file = data_dir / "model_state.json" if data_dir else None

    @property
    def vram_budget_mb(self) -> int:
        return self._vram_budget_mb
