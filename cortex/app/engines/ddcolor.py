"""DDColor colorization engine (Lab color space pipeline)."""
from __future__ import annotations

from typing import Any

import cv2
import numpy as np

from app.config import settings
from app.engines.base import BaseEngine
from app.model_manager import ModelInfo, OnnxModelManager
from app.utils import encode_png

_VARIANTS = {
    "artistic":   ("ddcolor/ddcolor-artistic.onnx",   100, True),
    "modelscope": ("ddcolor/ddcolor-modelscope.onnx", 200, False),
    "tiny":       ("ddcolor/ddcolor-tiny.onnx",        28, False),
}


class DDColorEngine(BaseEngine):
    def get_models(self) -> list[ModelInfo]:
        return [
            ModelInfo(
                name=f"ddcolor-{name}",
                onnx_path=settings.model_dir / path,
                vram_mb=vram,
                required=req,
            )
            for name, (path, vram, req) in _VARIANTS.items()
        ]

    def run(self, manager: OnnxModelManager, image: np.ndarray, **kwargs: Any) -> dict[str, Any]:
        model = kwargs.get("model", "artistic")
        input_size = kwargs.get("input_size", 512)

        model_name = f"ddcolor-{model}"
        session = manager.get_session(model_name)

        orig_h, orig_w = image.shape[:2]

        # Convert RGB to Lab
        lab = cv2.cvtColor(image, cv2.COLOR_RGB2Lab).astype(np.float32)
        l_orig = lab[:, :, 0]  # L channel [0, 100]

        # Resize L channel to model input size
        l_resized = cv2.resize(l_orig, (input_size, input_size), interpolation=cv2.INTER_LINEAR)

        # Normalize L to [0, 1] for model input
        l_norm = l_resized / 100.0
        # Create 3-channel input (replicate L)
        inp = np.stack([l_norm, l_norm, l_norm], axis=0)[np.newaxis].astype(np.float32)

        # Inference
        input_name = session.get_inputs()[0].name
        output_name = session.get_outputs()[0].name
        result = session.run([output_name], {input_name: inp})[0]

        # Postprocess: extract predicted ab channels
        # result shape: [1, 2, input_size, input_size]
        ab_pred = result[0].transpose(1, 2, 0)  # [H, W, 2]

        # Resize ab back to original size
        ab_resized = cv2.resize(ab_pred, (orig_w, orig_h), interpolation=cv2.INTER_LINEAR)

        # Merge L (original) with predicted ab
        colorized_lab = np.zeros((orig_h, orig_w, 3), dtype=np.float32)
        colorized_lab[:, :, 0] = l_orig
        colorized_lab[:, :, 1] = ab_resized[:, :, 0]
        colorized_lab[:, :, 2] = ab_resized[:, :, 1]

        # Convert back to RGB (float32 Lab -> float32 RGB in [0, 1])
        colorized = cv2.cvtColor(colorized_lab, cv2.COLOR_Lab2RGB)
        colorized = (colorized * 255.0).clip(0, 255).astype(np.uint8)

        return {
            "image_b64": encode_png(colorized),
            "extra_meta": {"input_size_used": input_size},
        }
