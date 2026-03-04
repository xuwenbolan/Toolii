"""BiRefNet background removal engine."""
from __future__ import annotations

from typing import Any

import cv2
import numpy as np

from app.config import settings
from app.engines.base import BaseEngine
from app.model_manager import ModelInfo, OnnxModelManager
from app.utils import encode_png

# (onnx_path, required)
_VARIANTS = {
    "general":  ("birefnet/birefnet-general.onnx",  True),
    "portrait": ("birefnet/birefnet-portrait.onnx", False),
    "lite":     ("birefnet/birefnet-lite.onnx",     False),
    "matting":  ("birefnet/birefnet-matting.onnx",   False),
}

# ImageNet normalization
_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


class BiRefNetEngine(BaseEngine):
    def get_models(self) -> list[ModelInfo]:
        return [
            ModelInfo(
                name=f"birefnet-{name}",
                onnx_path=settings.model_dir / path,
                required=req,
            )
            for name, (path, req) in _VARIANTS.items()
        ]

    def run(self, manager: OnnxModelManager, image: np.ndarray, **kwargs: Any) -> dict[str, Any]:
        model = kwargs.get("model", "general")
        output_type = kwargs.get("output_type", "rgba")
        threshold = kwargs.get("threshold")

        model_name = f"birefnet-{model}"
        session = manager.get_session(model_name)

        orig_h, orig_w = image.shape[:2]

        # Preprocess: resize to 1024x1024, normalize
        resized = cv2.resize(image, (1024, 1024), interpolation=cv2.INTER_LINEAR)
        inp = resized.astype(np.float32) / 255.0
        inp = (inp - _MEAN) / _STD
        inp = inp.transpose(2, 0, 1)[np.newaxis]  # [1, 3, 1024, 1024]

        # Inference
        input_name = session.get_inputs()[0].name
        output_name = session.get_outputs()[0].name
        result = session.run([output_name], {input_name: inp})[0]

        # Postprocess: sigmoid -> alpha matte
        alpha = 1.0 / (1.0 + np.exp(-result[0, 0]))  # sigmoid
        alpha = cv2.resize(alpha, (orig_w, orig_h), interpolation=cv2.INTER_LINEAR)

        # Optional binarization
        if threshold is not None:
            alpha = (alpha > threshold).astype(np.float32)

        alpha_u8 = (alpha * 255).clip(0, 255).astype(np.uint8)

        # Compute foreground ratio
        fg_ratio = round(float(np.mean(alpha > 0.5)), 4)

        extra_meta: dict[str, Any] = {
            "foreground_ratio": fg_ratio,
            "threshold_applied": threshold,
        }

        if output_type == "mask":
            # Return grayscale alpha matte
            return {
                "image_b64": encode_png(alpha_u8, mode="L"),
                "output_size": (orig_w, orig_h),
                "extra_meta": extra_meta,
            }
        else:
            # Return RGBA cutout
            rgba = np.dstack([image, alpha_u8])
            return {
                "image_b64": encode_png(rgba, mode="RGBA"),
                "output_size": (orig_w, orig_h),
                "extra_meta": extra_meta,
            }
