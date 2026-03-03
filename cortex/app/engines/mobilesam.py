"""MobileSAM segmentation engine (encoder + decoder)."""
from __future__ import annotations

import base64
import io
from typing import Any

import cv2
import numpy as np
from PIL import Image

from app.config import settings
from app.engines.base import BaseEngine
from app.model_manager import ModelInfo, OnnxModelManager

_ENCODER_SIZE = 1024


class MobileSAMEngine(BaseEngine):
    def get_models(self) -> list[ModelInfo]:
        base = settings.model_dir
        return [
            ModelInfo("mobilesam-encoder", base / "mobilesam/mobilesam-encoder.onnx", 20, True),
            ModelInfo("mobilesam-decoder", base / "mobilesam/mobilesam-decoder.onnx", 20, True),
        ]

    def run(self, manager: OnnxModelManager, image: np.ndarray, **kwargs: Any) -> dict[str, Any]:
        points = kwargs.get("points")
        boxes = kwargs.get("boxes")
        multimask = kwargs.get("multimask", False)
        mask_input_b64 = kwargs.get("mask_input_b64")

        encoder = manager.get_session("mobilesam-encoder")
        decoder = manager.get_session("mobilesam-decoder")

        orig_h, orig_w = image.shape[:2]

        # Encode image
        embeddings = self._encode(encoder, image, orig_h, orig_w)

        # Prepare prompts
        point_coords, point_labels = self._prepare_prompts(points, boxes, orig_w, orig_h)

        # Prepare mask input
        has_mask = np.array([0.0], dtype=np.float32)
        mask_input = np.zeros((1, 1, 256, 256), dtype=np.float32)
        if mask_input_b64:
            raw = base64.b64decode(mask_input_b64)
            mask_img = np.array(Image.open(io.BytesIO(raw)).convert("L"))
            mask_resized = cv2.resize(mask_img.astype(np.float32), (256, 256))
            mask_input[0, 0] = mask_resized
            has_mask[0] = 1.0

        orig_size = np.array([orig_h, orig_w], dtype=np.float32)

        # Decode
        decoder_inputs = {
            decoder.get_inputs()[0].name: embeddings,
            decoder.get_inputs()[1].name: point_coords,
            decoder.get_inputs()[2].name: point_labels,
            decoder.get_inputs()[3].name: mask_input,
            decoder.get_inputs()[4].name: has_mask,
            decoder.get_inputs()[5].name: orig_size,
        }
        masks_logits, iou_preds, low_res_masks = decoder.run(None, decoder_inputs)

        # Process masks
        num_masks = 3 if multimask else 1
        results = []
        for i in range(min(num_masks, masks_logits.shape[1])):
            mask = masks_logits[0, i]  # [H, W]
            mask_binary = (mask > 0.0).astype(np.uint8) * 255

            # Resize to original size if needed
            if mask_binary.shape != (orig_h, orig_w):
                mask_binary = cv2.resize(mask_binary, (orig_w, orig_h),
                                         interpolation=cv2.INTER_LINEAR)
                mask_binary = (mask_binary > 127).astype(np.uint8) * 255

            # Encode mask as PNG base64
            mask_img = Image.fromarray(mask_binary, mode="L")
            buf = io.BytesIO()
            mask_img.save(buf, format="PNG")
            mask_b64 = base64.b64encode(buf.getvalue()).decode("ascii")

            # Encode low-res mask for iterative refinement
            low_res = low_res_masks[0, i]  # [256, 256]
            lr_img = Image.fromarray(((low_res + 10) * 10).clip(0, 255).astype(np.uint8), mode="L")
            lr_buf = io.BytesIO()
            lr_img.save(lr_buf, format="PNG")
            lr_b64 = base64.b64encode(lr_buf.getvalue()).decode("ascii")

            results.append({
                "mask_b64": mask_b64,
                "score": float(iou_preds[0, i]),
                "low_res_mask_b64": lr_b64,
            })

        # Sort by score descending
        results.sort(key=lambda x: x["score"], reverse=True)

        if not multimask:
            results = results[:1]

        return {"masks": results}

    def _encode(self, encoder, image: np.ndarray, orig_h: int, orig_w: int) -> np.ndarray:
        """Encode image to embeddings using MobileSAM encoder."""
        # Resize maintaining aspect ratio, long side = 1024
        scale = _ENCODER_SIZE / max(orig_h, orig_w)
        new_h, new_w = int(orig_h * scale), int(orig_w * scale)
        resized = cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_LINEAR)

        # Pad to 1024x1024
        padded = np.zeros((_ENCODER_SIZE, _ENCODER_SIZE, 3), dtype=np.float32)
        padded[:new_h, :new_w] = resized.astype(np.float32)

        # Normalize (ImageNet stats)
        mean = np.array([123.675, 116.28, 103.53], dtype=np.float32)
        std = np.array([58.395, 57.12, 57.375], dtype=np.float32)
        padded = (padded - mean) / std

        # Adapt layout to model's expected input shape
        expected_shape = encoder.get_inputs()[0].shape
        expected_rank = len(expected_shape)
        channels_last = expected_shape[-1] == 3

        if channels_last:
            inp = padded  # HWC: [1024, 1024, 3]
        else:
            inp = padded.transpose(2, 0, 1)  # CHW: [3, 1024, 1024]

        if expected_rank == 4:
            inp = inp[np.newaxis]

        input_name = encoder.get_inputs()[0].name
        output_name = encoder.get_outputs()[0].name
        return encoder.run([output_name], {input_name: inp})[0]

    def _prepare_prompts(
        self,
        points: list[list[float]] | None,
        boxes: list[list[float]] | None,
        orig_w: int,
        orig_h: int,
    ) -> tuple[np.ndarray, np.ndarray]:
        """Convert user prompts to decoder input format."""
        coords_list = []
        labels_list = []

        # Scale factor from original to encoder input
        scale = _ENCODER_SIZE / max(orig_w, orig_h)

        if points:
            for pt in points:
                x, y = pt[0] * scale, pt[1] * scale
                label = int(pt[2]) if len(pt) > 2 else 1
                coords_list.append([x, y])
                labels_list.append(label)

        if boxes:
            for box in boxes:
                x1, y1, x2, y2 = [v * scale for v in box[:4]]
                coords_list.extend([[x1, y1], [x2, y2]])
                labels_list.extend([2, 3])

        if not coords_list:
            # Default: center point as foreground
            cx, cy = orig_w * scale / 2, orig_h * scale / 2
            coords_list.append([cx, cy])
            labels_list.append(1)

        coords = np.array([coords_list], dtype=np.float32)  # [1, N, 2]
        labels = np.array([labels_list], dtype=np.float32)   # [1, N]
        return coords, labels
