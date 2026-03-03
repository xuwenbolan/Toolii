"""RapidOCR text recognition engine (3-model pipeline).

RapidOCR manages its own ONNX sessions internally, so we cannot route
them through OnnxModelManager.  Instead we cache a single RapidOCR
instance and skip model registration (the ~35MB VRAM is negligible
vs. the 11GB budget).
"""
from __future__ import annotations

import logging
import threading
from typing import Any

import numpy as np

from app.config import settings
from app.engines.base import BaseEngine
from app.model_manager import ModelInfo, OnnxModelManager

logger = logging.getLogger(__name__)

_ocr_instance = None
_ocr_lock = threading.Lock()


def _get_ocr_instance():
    """Lazily create and cache a single RapidOCR instance."""
    global _ocr_instance
    if _ocr_instance is not None:
        return _ocr_instance

    with _ocr_lock:
        if _ocr_instance is not None:
            return _ocr_instance

        try:
            from rapidocr_onnxruntime import RapidOCR
        except ImportError:
            raise RuntimeError("rapidocr-onnxruntime not installed (use `uv sync --extra ocr`)")

        det_path = str(settings.model_dir / "rapidocr/rapidocr-det.onnx")
        cls_path = str(settings.model_dir / "rapidocr/rapidocr-cls.onnx")
        rec_path = str(settings.model_dir / "rapidocr/rapidocr-rec.onnx")

        _ocr_instance = RapidOCR(
            det_model_path=det_path,
            cls_model_path=cls_path,
            rec_model_path=rec_path,
        )
        logger.info("RapidOCR instance created (models loaded from %s)", settings.model_dir)
        return _ocr_instance


class RapidOCREngine(BaseEngine):
    def get_models(self) -> list[ModelInfo]:
        # RapidOCR manages its own sessions; nothing to register
        return []

    def run(self, manager: OnnxModelManager, image: np.ndarray, **kwargs: Any) -> dict[str, Any]:
        det_only = kwargs.get("det_only", False)
        box_thresh = kwargs.get("box_thresh", 0.5)
        text_score = kwargs.get("text_score", 0.5)

        engine = _get_ocr_instance()
        result, _elapse = engine(image, det_only=det_only, box_thresh=box_thresh, text_score=text_score)

        lines = []
        full_text_parts = []

        if result:
            for item in result:
                box = item[0] if len(item) > 0 else []
                text = str(item[1]) if len(item) > 1 else ""
                score = float(item[2]) if len(item) > 2 else 0.0

                line: dict[str, Any] = {
                    "text": text,
                    "score": score,
                    "box": [[float(p[0]), float(p[1])] for p in box] if box else [],
                }
                lines.append(line)
                if text:
                    full_text_parts.append(text)

        return {
            "lines": lines,
            "full_text": "\n".join(full_text_parts),
        }
