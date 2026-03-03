"""GFPGAN face restoration engine with SCRFD face detection (det_10g.onnx)."""
from __future__ import annotations

from typing import Any

import cv2
import numpy as np

from app.config import settings
from app.engines.base import BaseEngine
from app.model_manager import ModelInfo, OnnxModelManager
from app.utils import encode_png

# SCRFD constants for det_10g.onnx (9 outputs, fmc=3)
_DET_SIZE = 640
_STRIDES = [8, 16, 32]
_NUM_ANCHORS = 2
_FMC = 3


# -- SCRFD face detection helpers ------------------------------------------


def _generate_anchor_centers(height: int, width: int, stride: int) -> np.ndarray:
    """Generate anchor center grid for one stride level.

    Returns (H*W*num_anchors, 2) array of (x, y) coordinates in input image space.
    """
    # mgrid produces (row, col) -> [::-1] flips to (col, row) = (x, y)
    grid = np.stack(np.mgrid[:height, :width][::-1], axis=-1).astype(np.float32)
    centers = (grid * stride).reshape(-1, 2)
    if _NUM_ANCHORS > 1:
        centers = np.stack([centers] * _NUM_ANCHORS, axis=1).reshape(-1, 2)
    return centers


def _distance2bbox(points: np.ndarray, distance: np.ndarray) -> np.ndarray:
    """Convert anchor centers + distance predictions to [x1, y1, x2, y2] boxes.

    Args:
        points: (N, 2) anchor centers [x, y]
        distance: (N, 4) predictions [left, top, right, bottom]
    """
    x1 = points[:, 0] - distance[:, 0]
    y1 = points[:, 1] - distance[:, 1]
    x2 = points[:, 0] + distance[:, 2]
    y2 = points[:, 1] + distance[:, 3]
    return np.stack([x1, y1, x2, y2], axis=-1)


def _nms(dets: np.ndarray, thresh: float = 0.4) -> list[int]:
    """Non-maximum suppression on (N, 5) array of [x1, y1, x2, y2, score]."""
    x1 = dets[:, 0]
    y1 = dets[:, 1]
    x2 = dets[:, 2]
    y2 = dets[:, 3]
    scores = dets[:, 4]

    areas = (x2 - x1 + 1) * (y2 - y1 + 1)
    order = scores.argsort()[::-1]

    keep: list[int] = []
    while order.size > 0:
        i = order[0]
        keep.append(int(i))
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])

        w = np.maximum(0.0, xx2 - xx1 + 1)
        h = np.maximum(0.0, yy2 - yy1 + 1)
        inter = w * h
        ovr = inter / (areas[i] + areas[order[1:]] - inter)

        inds = np.where(ovr <= thresh)[0]
        order = order[inds + 1]

    return keep


def _detect_faces_scrfd(
    session, image: np.ndarray, det_thresh: float = 0.5, nms_thresh: float = 0.4,
) -> list[list[int]]:
    """Run SCRFD face detection (det_10g.onnx) and return [x1, y1, x2, y2] boxes.

    Args:
        session: ONNX InferenceSession for the SCRFD model.
        image: RGB uint8 numpy array (H, W, 3).
        det_thresh: Minimum confidence score.
        nms_thresh: NMS IoU threshold.
    """
    orig_h, orig_w = image.shape[:2]

    # Resize maintaining aspect ratio, pad to _DET_SIZE x _DET_SIZE
    im_ratio = orig_h / orig_w
    if im_ratio > 1.0:
        new_h = _DET_SIZE
        new_w = int(new_h / im_ratio)
    else:
        new_w = _DET_SIZE
        new_h = int(new_w * im_ratio)
    det_scale = new_h / orig_h

    resized = cv2.resize(image, (new_w, new_h))
    det_img = np.zeros((_DET_SIZE, _DET_SIZE, 3), dtype=np.uint8)
    det_img[:new_h, :new_w, :] = resized

    # Preprocess: (pixel - 127.5) / 128.0, HWC -> NCHW float32
    blob = det_img.astype(np.float32)
    blob = (blob - 127.5) / 128.0
    blob = blob.transpose(2, 0, 1)[np.newaxis]  # [1, 3, 640, 640]

    # Inference -> 9 outputs:
    #   [score_8, score_16, score_32, bbox_8, bbox_16, bbox_32, kps_8, kps_16, kps_32]
    input_name = session.get_inputs()[0].name
    net_outs = session.run(None, {input_name: blob})

    # Decode each stride level
    all_scores = []
    all_bboxes = []

    for idx, stride in enumerate(_STRIDES):
        feat_h = _DET_SIZE // stride
        feat_w = _DET_SIZE // stride

        scores = net_outs[idx]                   # (N, 1)
        bbox_preds = net_outs[idx + _FMC] * stride  # (N, 4) scaled to input space

        anchor_centers = _generate_anchor_centers(feat_h, feat_w, stride)

        # Filter by threshold
        pos_inds = np.where(scores.ravel() >= det_thresh)[0]
        if len(pos_inds) == 0:
            continue

        pos_scores = scores[pos_inds]
        pos_bbox_preds = bbox_preds[pos_inds]
        pos_anchors = anchor_centers[pos_inds]

        bboxes = _distance2bbox(pos_anchors, pos_bbox_preds)
        all_scores.append(pos_scores)
        all_bboxes.append(bboxes)

    if not all_scores:
        return []

    scores = np.vstack(all_scores).ravel()
    bboxes = np.vstack(all_bboxes)

    # Scale back to original image coordinates
    bboxes /= det_scale

    # NMS
    pre_det = np.hstack([bboxes, scores[:, np.newaxis]]).astype(np.float32)
    keep = _nms(pre_det, nms_thresh)

    boxes = []
    for k in keep:
        x1, y1, x2, y2 = bboxes[k]
        boxes.append([
            max(0, int(x1)), max(0, int(y1)),
            min(orig_w, int(x2)), min(orig_h, int(y2)),
        ])
    return boxes


# -- GFPGAN engine ---------------------------------------------------------


class GFPGANEngine(BaseEngine):
    def get_models(self) -> list[ModelInfo]:
        base = settings.model_dir
        return [
            ModelInfo("gfpgan-v1.4", base / "gfpgan/gfpgan-v1.4.onnx", 330, True),
            ModelInfo("retinaface", base / "gfpgan/retinaface-resnet50.onnx", 100, True),
        ]

    def run(self, manager: OnnxModelManager, image: np.ndarray, **kwargs: Any) -> dict[str, Any]:
        weight = kwargs.get("weight", 0.5)
        upscale_factor = kwargs.get("upscale", 2)
        only_center_face = kwargs.get("only_center_face", False)
        aligned = kwargs.get("aligned", False)

        h, w = image.shape[:2]

        if aligned:
            restored = self._restore_single_face(manager, image, weight)
            return {
                "image_b64": encode_png(restored),
                "output_size": (restored.shape[1], restored.shape[0]),
                "extra_meta": {"faces_found": 1, "faces_restored": 1, "face_boxes": []},
            }

        # Detect faces with SCRFD (det_10g.onnx)
        det_session = manager.get_session("retinaface")
        face_boxes = _detect_faces_scrfd(det_session, image)

        if only_center_face and len(face_boxes) > 1:
            areas = [(b[2] - b[0]) * (b[3] - b[1]) for b in face_boxes]
            idx = int(np.argmax(areas))
            face_boxes = [face_boxes[idx]]

        output = image.copy()
        if upscale_factor != 1:
            output = cv2.resize(output, (w * upscale_factor, h * upscale_factor),
                                interpolation=cv2.INTER_CUBIC)

        faces_restored = 0
        scaled_boxes = []
        for box in face_boxes:
            x1, y1, x2, y2 = box
            margin = int(max(x2 - x1, y2 - y1) * 0.3)
            fx1 = max(0, x1 - margin)
            fy1 = max(0, y1 - margin)
            fx2 = min(w, x2 + margin)
            fy2 = min(h, y2 + margin)

            face_crop = image[fy1:fy2, fx1:fx2]
            if face_crop.size == 0:
                continue

            face_512 = cv2.resize(face_crop, (512, 512), interpolation=cv2.INTER_LINEAR)
            restored_face = self._restore_single_face(manager, face_512, weight)

            out_fx1 = fx1 * upscale_factor
            out_fy1 = fy1 * upscale_factor
            out_fx2 = fx2 * upscale_factor
            out_fy2 = fy2 * upscale_factor
            paste_h = out_fy2 - out_fy1
            paste_w = out_fx2 - out_fx1
            if paste_h > 0 and paste_w > 0:
                resized_restored = cv2.resize(restored_face, (paste_w, paste_h),
                                              interpolation=cv2.INTER_LINEAR)
                output[out_fy1:out_fy2, out_fx1:out_fx2] = resized_restored
                faces_restored += 1
                scaled_boxes.append([out_fx1, out_fy1, out_fx2, out_fy2])

        out_h, out_w = output.shape[:2]
        return {
            "image_b64": encode_png(output),
            "output_size": (out_w, out_h),
            "extra_meta": {
                "faces_found": len(face_boxes),
                "faces_restored": faces_restored,
                "face_boxes": scaled_boxes,
            },
        }

    def _restore_single_face(
        self, manager: OnnxModelManager, face_512: np.ndarray, weight: float,
    ) -> np.ndarray:
        """Run GFPGAN on a single 512x512 face image."""
        session = manager.get_session("gfpgan-v1.4")

        inp = face_512.astype(np.float32) / 255.0
        inp = (inp - 0.5) / 0.5
        inp = inp.transpose(2, 0, 1)[np.newaxis]  # [1, 3, 512, 512]

        input_name = session.get_inputs()[0].name
        output_name = session.get_outputs()[0].name
        result = session.run([output_name], {input_name: inp})[0]

        restored = result[0].transpose(1, 2, 0)
        restored = (restored * 0.5 + 0.5) * 255.0
        restored = restored.clip(0, 255).astype(np.uint8)

        blended = cv2.addWeighted(restored, weight, face_512, 1.0 - weight, 0)
        return blended.astype(np.uint8)
