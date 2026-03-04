"""Face similarity comparison using Facenet512 ONNX embeddings.

Compares two face images across five facial regions (eyes, nose, mouth,
jawline, overall face) by extracting embeddings from region crops and
computing cosine similarity.
"""

from __future__ import annotations

import logging
import math
import threading
from pathlib import Path
from typing import Any

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Facenet512 ONNX model management
# ---------------------------------------------------------------------------

_FACENET_MODEL_PATH = Path(__file__).resolve().parents[3] / "data" / "models" / "facenet512.onnx"

_session_lock = threading.Lock()
_session_instance: Any = None
_session_init_attempted = False

_FACENET_INPUT_SIZE = 160


def _get_onnx_session() -> Any:
    """Get or create the ONNX InferenceSession singleton. Thread-safe."""
    global _session_instance, _session_init_attempted  # noqa: PLW0603

    if _session_instance is not None:
        return _session_instance
    if _session_init_attempted:
        return None

    with _session_lock:
        if _session_instance is not None:
            return _session_instance
        if _session_init_attempted:
            return None

        _session_init_attempted = True

        if not _FACENET_MODEL_PATH.exists():
            logger.warning("Facenet512 ONNX model not found at %s", _FACENET_MODEL_PATH)
            return None

        try:
            import onnxruntime as ort

            sess_opts = ort.SessionOptions()
            sess_opts.inter_op_num_threads = 2
            sess_opts.intra_op_num_threads = 2
            _session_instance = ort.InferenceSession(
                str(_FACENET_MODEL_PATH),
                sess_options=sess_opts,
                providers=["CPUExecutionProvider"],
            )
            logger.info("Facenet512 ONNX session initialized")
            return _session_instance
        except Exception:
            logger.warning("Failed to initialize Facenet512 ONNX session", exc_info=True)
            return None


def prewarm_facenet() -> bool:
    """Pre-load Facenet512 ONNX model. Returns True if ready."""
    session = _get_onnx_session()
    return session is not None


# ---------------------------------------------------------------------------
# Region landmark indices (MediaPipe 478-point face mesh)
# ---------------------------------------------------------------------------

_LEFT_EYE_INDICES = [33, 133, 160, 159, 158, 144, 145, 153, 154, 155, 157, 163, 7, 246]
_RIGHT_EYE_INDICES = [362, 263, 387, 386, 385, 373, 374, 380, 381, 382, 384, 398, 249, 466]
_NOSE_INDICES = [1, 2, 3, 4, 5, 6, 168, 197, 195, 48, 115, 220, 45, 275, 344, 440, 278]
_MOUTH_INDICES = [
    61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291,
    308, 324, 318, 402, 317, 14, 87, 178, 88, 95,
]
_JAWLINE_INDICES = [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
    397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
    172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
]

_REGIONS: dict[str, list[int]] = {
    "eyes": _LEFT_EYE_INDICES + _RIGHT_EYE_INDICES,
    "nose": _NOSE_INDICES,
    "mouth": _MOUTH_INDICES,
    "jawline": _JAWLINE_INDICES,
}

# Geometric ratio landmark indices
_IRIS_LEFT = 468
_IRIS_RIGHT = 473
_NOSE_TIP = 1
_NOSE_BRIDGE = 6
_CHIN = 152
_FOREHEAD = 10
_MOUTH_LEFT = 61
_MOUTH_RIGHT = 291
_LEFT_CHEEK = 234
_RIGHT_CHEEK = 454


# ---------------------------------------------------------------------------
# Region cropping
# ---------------------------------------------------------------------------

def _crop_region(
    img: np.ndarray,
    landmarks: list,
    indices: list[int],
    width: int,
    height: int,
    padding: float = 0.3,
) -> np.ndarray:
    """Crop a face region by landmark indices with padding."""
    xs = [landmarks[i].x * width for i in indices]
    ys = [landmarks[i].y * height for i in indices]

    x_min, x_max = min(xs), max(xs)
    y_min, y_max = min(ys), max(ys)

    w = x_max - x_min
    h = y_max - y_min
    pad_x = w * padding
    pad_y = h * padding

    x1 = max(0, int(x_min - pad_x))
    y1 = max(0, int(y_min - pad_y))
    x2 = min(width, int(x_max + pad_x))
    y2 = min(height, int(y_max + pad_y))

    crop = img[y1:y2, x1:x2]
    if crop.size == 0:
        # Fallback: return center region
        cx, cy = width // 2, height // 2
        s = min(width, height) // 4
        crop = img[max(0, cy - s):cy + s, max(0, cx - s):cx + s]
    return crop


def _crop_overall_face(
    img: np.ndarray,
    landmarks: list,
    width: int,
    height: int,
) -> np.ndarray:
    """Crop the full face region using all landmarks."""
    xs = [lm.x * width for lm in landmarks]
    ys = [lm.y * height for lm in landmarks]

    x1 = max(0, int(min(xs)))
    y1 = max(0, int(min(ys)))
    x2 = min(width, int(max(xs)) + 1)
    y2 = min(height, int(max(ys)) + 1)

    crop = img[y1:y2, x1:x2]
    if crop.size == 0:
        return img
    return crop


# ---------------------------------------------------------------------------
# Embedding extraction
# ---------------------------------------------------------------------------

def _preprocess_for_facenet(crop: np.ndarray) -> np.ndarray:
    """Resize to 160x160, normalize to [-1, 1], return (1, 3, 160, 160) float32."""
    resized = cv2.resize(crop, (_FACENET_INPUT_SIZE, _FACENET_INPUT_SIZE))
    rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
    normalized = (rgb.astype(np.float32) / 255.0 - 0.5) / 0.5
    # HWC -> CHW, add batch dim
    transposed = np.transpose(normalized, (2, 0, 1))
    return np.expand_dims(transposed, 0)


def _extract_embedding(crop: np.ndarray) -> np.ndarray | None:
    """Extract 512D embedding from a face region crop."""
    session = _get_onnx_session()
    if session is None:
        return None

    input_tensor = _preprocess_for_facenet(crop)
    input_name = session.get_inputs()[0].name
    outputs = session.run(None, {input_name: input_tensor})
    embedding = outputs[0][0].astype(np.float64)

    # L2 normalize
    norm = np.linalg.norm(embedding)
    if norm > 0:
        embedding = embedding / norm
    return embedding


# ---------------------------------------------------------------------------
# Similarity computation
# ---------------------------------------------------------------------------

def _cosine_similarity(emb1: np.ndarray, emb2: np.ndarray) -> float:
    """Cosine similarity between two L2-normalized embeddings."""
    return float(np.dot(emb1, emb2))


def _similarity_to_percent(sim: float) -> int:
    """Convert cosine similarity to a 15-98 score with non-linear mapping.

    Raw Facenet512 cosine similarities for different people typically
    range from -0.1 to 0.4, and same-person from 0.5 to 0.9+.
    We remap to a 15-98 range for a fun, spread-out distribution:
    - All pairs get at least 15% (no human face is 0% similar)
    - Same-person pairs top out around 95-98%
    """
    sim = max(0.0, min(1.0, sim))

    # Piecewise linear mapping for entertainment:
    # sim [0.0, 0.1] -> score [15, 25]    (very different)
    # sim [0.1, 0.3] -> score [25, 45]    (different people)
    # sim [0.3, 0.5] -> score [45, 65]    (some resemblance)
    # sim [0.5, 0.7] -> score [65, 82]    (strong resemblance)
    # sim [0.7, 1.0] -> score [82, 98]    (same person / twins)
    breakpoints = [(0.0, 15), (0.1, 25), (0.3, 45), (0.5, 65), (0.7, 82), (1.0, 98)]
    for i in range(1, len(breakpoints)):
        s0, p0 = breakpoints[i - 1]
        s1, p1 = breakpoints[i]
        if sim <= s1:
            t = (sim - s0) / (s1 - s0) if s1 > s0 else 0
            return int(round(p0 + t * (p1 - p0)))
    return 98


# ---------------------------------------------------------------------------
# Geometric ratios (for fun descriptions only, not scoring)
# ---------------------------------------------------------------------------

def _lm_dist(landmarks: list, i: int, j: int, w: int, h: int) -> float:
    """Euclidean pixel distance between two landmarks."""
    dx = (landmarks[i].x - landmarks[j].x) * w
    dy = (landmarks[i].y - landmarks[j].y) * h
    return math.sqrt(dx * dx + dy * dy)


def compute_geometric_ratios(landmarks: list, w: int, h: int) -> dict[str, float]:
    """Compute facial geometric ratios for generating fun descriptions."""
    face_width = _lm_dist(landmarks, _LEFT_CHEEK, _RIGHT_CHEEK, w, h)
    face_height = _lm_dist(landmarks, _FOREHEAD, _CHIN, w, h)

    if face_width < 1 or face_height < 1:
        return {}

    eye_distance = _lm_dist(landmarks, _IRIS_LEFT, _IRIS_RIGHT, w, h)
    nose_length = _lm_dist(landmarks, _NOSE_BRIDGE, _NOSE_TIP, w, h)
    mouth_width = _lm_dist(landmarks, _MOUTH_LEFT, _MOUTH_RIGHT, w, h)

    return {
        "eye_distance_ratio": eye_distance / face_width,
        "nose_length_ratio": nose_length / face_height,
        "mouth_width_ratio": mouth_width / face_width,
        "face_aspect_ratio": face_height / face_width,
    }


# ---------------------------------------------------------------------------
# Main comparison function
# ---------------------------------------------------------------------------

def compare_faces(
    img1: np.ndarray,
    img2: np.ndarray,
    landmarks1: list,
    landmarks2: list,
    w1: int, h1: int,
    w2: int, h2: int,
) -> dict[str, Any]:
    """Compare two faces across all regions.

    Returns dict with 'regions' (per-region scores) and 'overall_score'.
    Raises RuntimeError if ONNX model is unavailable.
    """
    regions: dict[str, dict[str, Any]] = {}

    # Per-region comparison
    for region_name, indices in _REGIONS.items():
        crop1 = _crop_region(img1, landmarks1, indices, w1, h1)
        crop2 = _crop_region(img2, landmarks2, indices, w2, h2)

        emb1 = _extract_embedding(crop1)
        emb2 = _extract_embedding(crop2)

        if emb1 is None or emb2 is None:
            raise RuntimeError("Facenet512 ONNX model unavailable")

        sim = _cosine_similarity(emb1, emb2)
        score = _similarity_to_percent(sim)
        regions[region_name] = {"score": score, "raw_similarity": sim}

    # Overall face comparison
    crop_full1 = _crop_overall_face(img1, landmarks1, w1, h1)
    crop_full2 = _crop_overall_face(img2, landmarks2, w2, h2)
    emb_full1 = _extract_embedding(crop_full1)
    emb_full2 = _extract_embedding(crop_full2)

    if emb_full1 is None or emb_full2 is None:
        raise RuntimeError("Facenet512 ONNX model unavailable")

    full_sim = _cosine_similarity(emb_full1, emb_full2)
    overall_score = _similarity_to_percent(full_sim)
    regions["overall_face"] = {"score": overall_score, "raw_similarity": full_sim}

    # Geometric ratios
    ratios1 = compute_geometric_ratios(landmarks1, w1, h1)
    ratios2 = compute_geometric_ratios(landmarks2, w2, h2)

    return {
        "regions": regions,
        "overall_score": overall_score,
        "ratios1": ratios1,
        "ratios2": ratios2,
    }
