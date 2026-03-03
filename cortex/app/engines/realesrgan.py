"""Real-ESRGAN super resolution engine with tiling support."""
from __future__ import annotations

from typing import Any

import cv2
import numpy as np

from app.config import settings
from app.engines.base import BaseEngine
from app.model_manager import ModelInfo, OnnxModelManager
from app.utils import encode_png

_VARIANTS = {
    "x4plus": ("realesrgan/realesrgan-x4plus.onnx", 200, True, 4),
    "x4v3":   ("realesrgan/realesrgan-x4v3.onnx",    50, True, 4),
    "anime":  ("realesrgan/realesrgan-anime.onnx",   200, False, 4),
}

_TILE_PAD = 10
_DEFAULT_TILE = 512


class RealESRGANEngine(BaseEngine):
    def get_models(self) -> list[ModelInfo]:
        return [
            ModelInfo(
                name=f"realesrgan-{name}",
                onnx_path=settings.model_dir / path,
                vram_mb=vram,
                required=req,
            )
            for name, (path, vram, req, _) in _VARIANTS.items()
        ]

    def run(self, manager: OnnxModelManager, image: np.ndarray, **kwargs: Any) -> dict[str, Any]:
        model = kwargs.get("model", "x4plus")
        scale = kwargs.get("scale", 4)
        tile_size = kwargs.get("tile_size", 0)
        denoise_strength = kwargs.get("denoise_strength")
        face_enhance = kwargs.get("face_enhance", False)

        model_name = f"realesrgan-{model}"
        session = manager.get_session(model_name)
        net_scale = _VARIANTS[model][3]

        if tile_size <= 0:
            tile_size = _DEFAULT_TILE

        h, w = image.shape[:2]
        output = self._tile_process(session, image, tile_size, net_scale)

        # If requested scale is 2 but model is 4x, downscale result
        if scale == 2 and net_scale == 4:
            out_h, out_w = output.shape[:2]
            output = cv2.resize(output, (out_w // 2, out_h // 2), interpolation=cv2.INTER_AREA)

        # DNI blending for x4v3 with denoise_strength (simplified: blend input/output)
        if denoise_strength is not None and model == "x4v3":
            s = max(0.0, min(1.0, denoise_strength))
            upscaled_input = cv2.resize(image, (output.shape[1], output.shape[0]),
                                        interpolation=cv2.INTER_CUBIC)
            output = cv2.addWeighted(output, s, upscaled_input, 1.0 - s, 0).astype(np.uint8)

        # Optional face enhancement via GFPGAN on the upscaled result
        face_enhanced = False
        if face_enhance:
            from app.engines.gfpgan import GFPGANEngine
            try:
                gfpgan_result = GFPGANEngine().run(
                    manager, output, weight=0.5, upscale=1,
                )
                if gfpgan_result.get("extra_meta", {}).get("faces_restored", 0) > 0:
                    from app.utils import decode_image
                    # GFPGANEngine returns base64, decode it back
                    output, _ = decode_image(gfpgan_result["image_b64"])
                    face_enhanced = True
            except Exception:
                pass  # face enhancement is best-effort

        out_h, out_w = output.shape[:2]
        extra_meta: dict[str, Any] = {
            "scale_applied": scale,
            "tiles_used": max(1, (h // tile_size + 1) * (w // tile_size + 1)),
            "face_enhanced": face_enhanced,
        }

        return {
            "image_b64": encode_png(output),
            "output_size": (out_w, out_h),
            "extra_meta": extra_meta,
        }

    def _tile_process(
        self,
        session,
        image: np.ndarray,
        tile_size: int,
        scale: int,
    ) -> np.ndarray:
        """Process image with tiling to avoid VRAM overflow."""
        h, w, c = image.shape

        # If image fits in a single tile, run directly
        if h <= tile_size and w <= tile_size:
            return self._run_tile(session, image, scale)

        output = np.zeros((h * scale, w * scale, c), dtype=np.uint8)
        pad = _TILE_PAD

        for y in range(0, h, tile_size):
            for x in range(0, w, tile_size):
                # Tile with padding
                y1 = max(0, y - pad)
                x1 = max(0, x - pad)
                y2 = min(h, y + tile_size + pad)
                x2 = min(w, x + tile_size + pad)

                tile = image[y1:y2, x1:x2]
                result = self._run_tile(session, tile, scale)

                # Crop padding from result
                oy1 = (y - y1) * scale
                ox1 = (x - x1) * scale
                tile_h = min(tile_size, h - y) * scale
                tile_w = min(tile_size, w - x) * scale
                output[y * scale:y * scale + tile_h, x * scale:x * scale + tile_w] = \
                    result[oy1:oy1 + tile_h, ox1:ox1 + tile_w]

        return output

    def _run_tile(self, session, tile: np.ndarray, scale: int) -> np.ndarray:
        """Run inference on a single tile."""
        inp = tile.astype(np.float32) / 255.0
        inp = inp.transpose(2, 0, 1)[np.newaxis]  # [1, 3, H, W]

        input_name = session.get_inputs()[0].name
        output_name = session.get_outputs()[0].name
        result = session.run([output_name], {input_name: inp})[0]

        # [1, 3, H*s, W*s] -> [H*s, W*s, 3]
        out = result[0].transpose(1, 2, 0)
        out = (out * 255.0).clip(0, 255).astype(np.uint8)
        return out
