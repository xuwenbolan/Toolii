from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

import numpy as np

from app.model_manager import ModelInfo, OnnxModelManager


class BaseEngine(ABC):
    """Each engine handles one family of models (e.g. all BiRefNet variants)."""

    @abstractmethod
    def get_models(self) -> list[ModelInfo]:
        """Declare all model variants this engine supports."""

    @abstractmethod
    def run(self, manager: OnnxModelManager, image: np.ndarray, **kwargs: Any) -> dict[str, Any]:
        """Execute inference with full parameters.

        Returns response dict (with ``image_b64`` and/or other fields).
        Engine selects model variant based on kwargs (e.g. model='portrait').
        Handles pre/post processing internally.
        """
