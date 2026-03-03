"""NAFNet denoising / deblurring engine."""
from __future__ import annotations

from typing import Any

import cv2
import numpy as np

from app.config import settings
from app.engines.base import BaseEngine
from app.model_manager import ModelInfo, OnnxModelManager
from app.utils import encode_png

# (onnx_path, vram_mb, required, task)
_VARIANTS = {
    "nafnet-sidd-w64":  ("nafnet/nafnet-sidd-w64.onnx",  105, True,  "denoise"),
    "nafnet-sidd-w32":  ("nafnet/nafnet-sidd-w32.onnx",   30, False, "denoise"),
    "nafnet-gopro-w64": ("nafnet/nafnet-gopro-w64.onnx",  105, False, "deblur"),
    "nafnet-gopro-w32": ("nafnet/nafnet-gopro-w32.onnx",   30, False, "deblur"),
}

_TILE_PAD = 8
_DEFAULT_TILE = 512


class NAFNetEngine(BaseEngine):
    def get_models(self) -> list[ModelInfo]:
        return [
            ModelInfo(
                name=name,
                onnx_path=settings.model_dir / path,
                vram_mb=vram,
                required=req,
            )
            for name, (path, vram, req, _) in _VARIANTS.items()
        ]

    def run(self, manager: OnnxModelManager, image: np.ndarray, **kwargs: Any) -> dict[str, Any]:
        task = kwargs.get("task", "denoise")
        strength = kwargs.get("strength", 1.0)
        model_width = kwargs.get("model_width", 64)
        tile_size = kwargs.get("tile_size", 0)

        # Select model variant
        dataset = "sidd" if task == "denoise" else "gopro"
        model_name = f"nafnet-{dataset}-w{model_width}"
        session = manager.get_session(model_name)

        if tile_size <= 0:
            tile_size = _DEFAULT_TILE

        h, w = image.shape[:2]
        denoised = self._tile_process(session, image, tile_size)

        # Blend with original based on strength
        if strength < 1.0:
            s = max(0.0, min(1.0, strength))
            denoised = cv2.addWeighted(denoised, s, image, 1.0 - s, 0).astype(np.uint8)

        tiles_used = max(1, ((h - 1) // tile_size + 1) * ((w - 1) // tile_size + 1))

        return {
            "image_b64": encode_png(denoised),
            "model_name": model_name,
            "extra_meta": {
                "task": task,
                "model_width": model_width,
                "strength_applied": strength,
                "tiles_used": tiles_used,
            },
        }

    def _tile_process(self, session, image: np.ndarray, tile_size: int) -> np.ndarray:
        h, w, c = image.shape
        if h <= tile_size and w <= tile_size:
            return self._run_tile(session, image)

        output = np.zeros_like(image)
        pad = _TILE_PAD
        for y in range(0, h, tile_size):
            for x in range(0, w, tile_size):
                y1 = max(0, y - pad)
                x1 = max(0, x - pad)
                y2 = min(h, y + tile_size + pad)
                x2 = min(w, x + tile_size + pad)

                tile = image[y1:y2, x1:x2]
                result = self._run_tile(session, tile)

                oy1 = y - y1
                ox1 = x - x1
                th = min(tile_size, h - y)
                tw = min(tile_size, w - x)
                output[y:y + th, x:x + tw] = result[oy1:oy1 + th, ox1:ox1 + tw]

        return output

    def _run_tile(self, session, tile: np.ndarray) -> np.ndarray:
        inp = tile.astype(np.float32) / 255.0
        inp = inp.transpose(2, 0, 1)[np.newaxis]

        input_name = session.get_inputs()[0].name
        output_name = session.get_outputs()[0].name
        result = session.run([output_name], {input_name: inp})[0]

        out = result[0].transpose(1, 2, 0)
        return (out * 255.0).clip(0, 255).astype(np.uint8)
