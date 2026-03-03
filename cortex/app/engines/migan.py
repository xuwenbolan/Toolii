"""MI-GAN inpainting engine (small mask areas, fast)."""
from __future__ import annotations

from typing import Any

import cv2
import numpy as np

from app.config import settings
from app.engines.base import BaseEngine
from app.model_manager import ModelInfo, OnnxModelManager
from app.utils import encode_png

_INFER_SIZE = 512


class MIGANEngine(BaseEngine):
    def get_models(self) -> list[ModelInfo]:
        return [
            ModelInfo("migan", settings.model_dir / "inpaint/migan.onnx", 11, True),
        ]

    def run(self, manager: OnnxModelManager, image: np.ndarray, **kwargs: Any) -> dict[str, Any]:
        mask = kwargs["mask"]  # grayscale uint8, white=inpaint (API convention)
        dilate_kernel = kwargs.get("dilate_kernel", 0)

        session = manager.get_session("migan")
        orig_h, orig_w = image.shape[:2]

        # Optional dilation
        if dilate_kernel > 0:
            kernel = np.ones((dilate_kernel, dilate_kernel), np.uint8)
            mask = cv2.dilate(mask, kernel, iterations=1)

        # Resize
        img_resized = cv2.resize(image, (_INFER_SIZE, _INFER_SIZE), interpolation=cv2.INTER_LINEAR)
        mask_resized = cv2.resize(mask, (_INFER_SIZE, _INFER_SIZE), interpolation=cv2.INTER_NEAREST)

        # MI-GAN uses inverted mask: white=known, black=inpaint
        mask_inverted = 255 - mask_resized
        mask_binary = (mask_inverted > 127).astype(np.float32)

        # Prepare inputs — check model's expected dtype
        input_type = session.get_inputs()[0].type
        if "uint8" in input_type:
            img_inp = img_resized.transpose(2, 0, 1)[np.newaxis].astype(np.uint8)
            mask_inp = (mask_binary * 255).astype(np.uint8)[np.newaxis, np.newaxis]
        else:
            img_inp = (img_resized.astype(np.float32) / 255.0).transpose(2, 0, 1)[np.newaxis]
            mask_inp = mask_binary[np.newaxis, np.newaxis]

        input_names = [inp.name for inp in session.get_inputs()]
        output_name = session.get_outputs()[0].name

        feed = {}
        if len(input_names) >= 2:
            feed[input_names[0]] = img_inp
            feed[input_names[1]] = mask_inp
        else:
            combined = np.concatenate([img_inp, mask_inp], axis=1)
            feed[input_names[0]] = combined

        result = session.run([output_name], feed)[0]

        out = result[0].transpose(1, 2, 0)
        # Adapt output conversion based on value range
        if out.dtype == np.uint8:
            pass  # already 0-255
        else:
            out = (out * 255.0).clip(0, 255).astype(np.uint8)
        out = cv2.resize(out, (orig_w, orig_h), interpolation=cv2.INTER_LINEAR)

        # Paste only inpainted region
        mask_full = cv2.resize(
            (mask_resized > 127).astype(np.float32),
            (orig_w, orig_h), interpolation=cv2.INTER_NEAREST,
        )
        mask_3c = np.stack([mask_full] * 3, axis=2)
        output = np.where(mask_3c > 0.5, out, image)

        return {"image_b64": encode_png(output)}
