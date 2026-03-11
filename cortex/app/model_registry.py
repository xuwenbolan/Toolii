"""Model registration, discovery, configuration, and state persistence."""
from __future__ import annotations

import json
import logging
import math
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app import gpu

logger = logging.getLogger(__name__)


@dataclass
class ModelInfo:
    name: str
    onnx_path: Path
    vram_mb: int = 0          # 0 = auto-detect from file size
    required: bool = True
    workspace_mb: int = 0     # inference workspace; 0 = auto (max(500, vram_mb))
    cpu_only: bool = False    # force CPU execution (for models with GPU-unfriendly ops)
    enabled: bool = True      # admin toggle; disabled models reject requests


class ModelDisabledError(RuntimeError):
    """Raised when a disabled model is requested."""


@dataclass
class ModelEvent:
    timestamp: float
    event: str  # "loaded", "evicted_*", "oom_retry", "workspace_warning"
    model: str
    vram_before_mb: int
    vram_after_mb: int
    detail: str = ""


class ModelRegistryMixin:
    """Mixin that provides model registration, profile data, and state persistence.

    Expects the host class to have:
      - _registry: dict[str, ModelInfo]
      - _profile_data: dict[str, dict[str, Any]]
      - _state_file: Path | None
    """

    # -- Registration ----------------------------------------------------------

    def register(self, info: ModelInfo) -> None:
        """Register a model. Auto-detect vram_mb from file size if 0."""
        if info.cpu_only:
            info.vram_mb = 0
            info.workspace_mb = 0
        elif info.vram_mb <= 0 and info.onnx_path.exists():
            file_mb = info.onnx_path.stat().st_size / (1024 * 1024)
            info.vram_mb = math.ceil(file_mb * 1.2)
            logger.debug("Auto-detected vram_mb=%d for %s (file=%.1fMB)",
                         info.vram_mb, info.name, file_mb)
        if not info.cpu_only and info.workspace_mb <= 0:
            info.workspace_mb = max(500, info.vram_mb)
        # Apply profile data if available
        profile = self._profile_data.get(info.name)
        if profile:
            info.workspace_mb = profile.get("workspace_peak_mb", info.workspace_mb)
            logger.info("Applied profile workspace_mb=%d for %s", info.workspace_mb, info.name)
        self._registry[info.name] = info

    def register_many(self, infos: list[ModelInfo]) -> None:
        for info in infos:
            self.register(info)

    # -- Profile data ----------------------------------------------------------

    def load_profile(self, path: Path) -> None:
        """Load vram_profile.json and apply workspace data to registered models."""
        if not path.exists():
            return
        try:
            data = json.loads(path.read_text())
            models = data if isinstance(data, list) else data.get("models", [])
            for entry in models:
                name = entry.get("model", "")
                if name:
                    self._profile_data[name] = entry
            logger.info("Loaded VRAM profile for %d models from %s",
                        len(self._profile_data), path)
            # Re-apply to already registered models
            for name, profile in self._profile_data.items():
                info = self._registry.get(name)
                if info:
                    info.workspace_mb = profile.get("workspace_peak_mb", info.workspace_mb)
        except Exception:
            logger.warning("Failed to load VRAM profile from %s", path, exc_info=True)

    @staticmethod
    def save_profile(results: list[dict[str, Any]], path: Path) -> None:
        """Save profile results to JSON."""
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"models": results}, indent=2))
        logger.info("Saved VRAM profile to %s", path)

    # -- Enable / Disable ------------------------------------------------------

    def enable_model(self, model_name: str) -> dict[str, Any]:
        """Re-enable a disabled model."""
        info = self._registry.get(model_name)
        if info is None:
            return {"status": "error", "error": "not_registered"}
        info.enabled = True
        self._save_model_state()
        logger.info("Model %s enabled", model_name)
        return {"status": "ok", "model": model_name, "enabled": True}

    def disable_model(self, model_name: str) -> dict[str, Any]:
        """Disable a model. Required models cannot be disabled.

        Unloads the model if currently loaded.
        """
        info = self._registry.get(model_name)
        if info is None:
            return {"status": "error", "error": "not_registered"}
        if info.required:
            return {"status": "error", "error": "cannot_disable_required"}
        info.enabled = False
        vram_freed = 0
        with self._lock:
            loaded = self._models.get(model_name)
            if loaded:
                vram_before = gpu.vram_used_mb()
                self._evict_model(model_name, reason="disabled")
                vram_freed = max(0, vram_before - gpu.vram_used_mb())
        self._save_model_state()
        logger.info("Model %s disabled (freed %dMB)", model_name, vram_freed)
        return {"status": "ok", "model": model_name, "enabled": False,
                "vram_freed_mb": vram_freed}

    # -- State persistence -----------------------------------------------------

    def _save_model_state(self) -> None:
        """Persist enabled/disabled state to JSON."""
        if self._state_file is None:
            return
        disabled = [n for n, info in self._registry.items() if not info.enabled]
        try:
            self._state_file.parent.mkdir(parents=True, exist_ok=True)
            self._state_file.write_text(json.dumps({"disabled": disabled}, indent=2))
        except Exception:
            logger.warning("Failed to save model state to %s", self._state_file,
                           exc_info=True)

    def load_model_state(self) -> None:
        """Restore enabled/disabled state from JSON."""
        if self._state_file is None or not self._state_file.exists():
            return
        try:
            data = json.loads(self._state_file.read_text())
            disabled = data.get("disabled", [])
            for name in disabled:
                info = self._registry.get(name)
                if info and not info.required:
                    info.enabled = False
            if disabled:
                logger.info("Restored disabled models: %s", disabled)
        except Exception:
            logger.warning("Failed to load model state from %s", self._state_file,
                           exc_info=True)
