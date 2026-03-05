"""Face similarity comparison using Facenet512 + geometric landmark analysis.

Overall face similarity uses Facenet512 ONNX embeddings with face alignment.
Per-region similarity (eyes, nose, mouth, jawline) uses geometric landmark
ratios since Facenet512 is not discriminative on partial face crops.
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
# Landmark indices (MediaPipe 478-point face mesh)
# ---------------------------------------------------------------------------

# Eye contour landmarks
_LEFT_EYE_INNER = 133
_LEFT_EYE_OUTER = 33
_LEFT_EYE_TOP = 159
_LEFT_EYE_BOTTOM = 145
_RIGHT_EYE_INNER = 362
_RIGHT_EYE_OUTER = 263
_RIGHT_EYE_TOP = 386
_RIGHT_EYE_BOTTOM = 374

# Iris centers
_IRIS_LEFT = 468
_IRIS_RIGHT = 473

# Nose landmarks
_NOSE_TIP = 1
_NOSE_BRIDGE = 6
_NOSTRIL_LEFT = 48
_NOSTRIL_RIGHT = 278
_NOSE_BRIDGE_LEFT = 193
_NOSE_BRIDGE_RIGHT = 417

# Mouth landmarks
_MOUTH_LEFT = 61
_MOUTH_RIGHT = 291
_LIP_TOP = 0
_LIP_BOTTOM = 17
_UPPER_LIP_TOP = 13
_LOWER_LIP_BOTTOM = 14

# Face boundary landmarks
_CHIN = 152
_FOREHEAD = 10
_LEFT_CHEEK = 234
_RIGHT_CHEEK = 454
_JAW_LEFT = 172
_JAW_RIGHT = 397
_FOREHEAD_LEFT = 54
_FOREHEAD_RIGHT = 284
_CHIN_LEFT = 149
_CHIN_RIGHT = 378


# ---------------------------------------------------------------------------
# Geometric helper
# ---------------------------------------------------------------------------

def _lm_dist(landmarks: list, i: int, j: int, w: int, h: int) -> float:
    """Euclidean pixel distance between two landmarks."""
    dx = (landmarks[i].x - landmarks[j].x) * w
    dy = (landmarks[i].y - landmarks[j].y) * h
    return math.sqrt(dx * dx + dy * dy)


def _lm_px(landmarks: list, i: int, w: int, h: int) -> tuple[float, float]:
    """Landmark pixel coordinates."""
    return (landmarks[i].x * w, landmarks[i].y * h)


# ---------------------------------------------------------------------------
# Per-region geometric feature extraction
# ---------------------------------------------------------------------------

# Each region feature: (name, sigma) — sigma controls sensitivity
# Larger sigma = more tolerant of differences
_EYES_FEATURES: list[tuple[str, float]] = [
    ("eye_ar_left", 0.08),       # left eye aspect ratio (expression-sensitive)
    ("eye_ar_right", 0.08),      # right eye aspect ratio (expression-sensitive)
    ("ipd_ratio", 0.025),        # inter-pupillary distance / face width
    ("eye_vertical_pos", 0.02),  # eye center Y position / face height
]

_NOSE_FEATURES: list[tuple[str, float]] = [
    ("nose_length_ratio", 0.025),  # nose length / face height
    ("nose_width_ratio", 0.025),   # nostril span / face width
    ("nose_bridge_ratio", 0.015),  # bridge width / face width
]

_MOUTH_FEATURES: list[tuple[str, float]] = [
    ("mouth_width_ratio", 0.06),   # mouth width / face width
    ("lip_height_ratio", 0.035),   # lip height / face height
    ("mouth_vertical_pos", 0.035), # mouth center Y / face height
]

_JAWLINE_FEATURES: list[tuple[str, float]] = [
    ("face_aspect_ratio", 0.07),  # face height / face width
    ("jaw_width_ratio", 0.04),    # jaw width / face width
    ("forehead_ratio", 0.04),     # forehead width / face width
    ("chin_angle", 0.07),         # chin angle normalized (pose-sensitive)
]


def _extract_geometric_features(landmarks: list, w: int, h: int) -> dict[str, float] | None:
    """Extract all geometric features from face landmarks."""
    face_width = _lm_dist(landmarks, _LEFT_CHEEK, _RIGHT_CHEEK, w, h)
    face_height = _lm_dist(landmarks, _FOREHEAD, _CHIN, w, h)
    if face_width < 1 or face_height < 1:
        return None

    # Eyes
    le_w = _lm_dist(landmarks, _LEFT_EYE_INNER, _LEFT_EYE_OUTER, w, h)
    le_h = _lm_dist(landmarks, _LEFT_EYE_TOP, _LEFT_EYE_BOTTOM, w, h)
    re_w = _lm_dist(landmarks, _RIGHT_EYE_INNER, _RIGHT_EYE_OUTER, w, h)
    re_h = _lm_dist(landmarks, _RIGHT_EYE_TOP, _RIGHT_EYE_BOTTOM, w, h)
    ipd = _lm_dist(landmarks, _IRIS_LEFT, _IRIS_RIGHT, w, h)
    eye_cy = (landmarks[_IRIS_LEFT].y * h + landmarks[_IRIS_RIGHT].y * h) / 2
    forehead_y = landmarks[_FOREHEAD].y * h

    # Nose
    nose_len = _lm_dist(landmarks, _NOSE_BRIDGE, _NOSE_TIP, w, h)
    nose_w = _lm_dist(landmarks, _NOSTRIL_LEFT, _NOSTRIL_RIGHT, w, h)
    bridge_w = _lm_dist(landmarks, _NOSE_BRIDGE_LEFT, _NOSE_BRIDGE_RIGHT, w, h)

    # Mouth
    mouth_w = _lm_dist(landmarks, _MOUTH_LEFT, _MOUTH_RIGHT, w, h)
    lip_h = _lm_dist(landmarks, _LIP_TOP, _LIP_BOTTOM, w, h)
    mouth_cy = (landmarks[_LIP_TOP].y * h + landmarks[_LIP_BOTTOM].y * h) / 2

    # Jawline
    jaw_w = _lm_dist(landmarks, _JAW_LEFT, _JAW_RIGHT, w, h)
    fh_w = _lm_dist(landmarks, _FOREHEAD_LEFT, _FOREHEAD_RIGHT, w, h)

    # Chin angle
    chin = _lm_px(landmarks, _CHIN, w, h)
    cl = _lm_px(landmarks, _CHIN_LEFT, w, h)
    cr = _lm_px(landmarks, _CHIN_RIGHT, w, h)
    v1 = (cl[0] - chin[0], cl[1] - chin[1])
    v2 = (cr[0] - chin[0], cr[1] - chin[1])
    dot = v1[0] * v2[0] + v1[1] * v2[1]
    m1 = math.sqrt(v1[0] ** 2 + v1[1] ** 2)
    m2 = math.sqrt(v2[0] ** 2 + v2[1] ** 2)
    chin_angle = math.acos(max(-1.0, min(1.0, dot / (m1 * m2 + 1e-9))))

    return {
        # Eyes
        "eye_ar_left": le_h / max(le_w, 1),
        "eye_ar_right": re_h / max(re_w, 1),
        "ipd_ratio": ipd / face_width,
        "eye_vertical_pos": (eye_cy - forehead_y) / face_height,
        # Nose
        "nose_length_ratio": nose_len / face_height,
        "nose_width_ratio": nose_w / face_width,
        "nose_bridge_ratio": bridge_w / face_width,
        # Mouth
        "mouth_width_ratio": mouth_w / face_width,
        "lip_height_ratio": lip_h / face_height,
        "mouth_vertical_pos": (mouth_cy - forehead_y) / face_height,
        # Jawline
        "face_aspect_ratio": face_height / face_width,
        "jaw_width_ratio": jaw_w / face_width,
        "forehead_ratio": fh_w / face_width,
        "chin_angle": chin_angle / math.pi,  # normalize to 0-1
        # Legacy ratios (for fun facts display)
        "eye_distance_ratio": ipd / face_width,
    }


def _compute_region_similarity(
    feats1: dict[str, float],
    feats2: dict[str, float],
    feature_spec: list[tuple[str, float]],
) -> float:
    """Compute average gaussian similarity for a set of features.

    Returns raw similarity in [0, 1] range.
    """
    if not feature_spec:
        return 0.5

    total = 0.0
    count = 0
    for feat_name, sigma in feature_spec:
        v1 = feats1.get(feat_name)
        v2 = feats2.get(feat_name)
        if v1 is None or v2 is None:
            continue
        diff = abs(v1 - v2)
        sim = math.exp(-(diff / sigma) ** 2)
        total += sim
        count += 1

    return total / count if count > 0 else 0.5


# ---------------------------------------------------------------------------
# Face cropping for Facenet512
# ---------------------------------------------------------------------------

def _crop_full_face(
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
    """Normalize to [-1, 1], return (1, 3, 160, 160) float32.

    Input should already be 160x160 from alignment.
    """
    if crop.shape[0] != _FACENET_INPUT_SIZE or crop.shape[1] != _FACENET_INPUT_SIZE:
        crop = cv2.resize(crop, (_FACENET_INPUT_SIZE, _FACENET_INPUT_SIZE))
    rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
    normalized = (rgb.astype(np.float32) / 255.0 - 0.5) / 0.5
    transposed = np.transpose(normalized, (2, 0, 1))
    return np.expand_dims(transposed, 0)


def _extract_embedding(crop: np.ndarray) -> np.ndarray | None:
    """Extract 512D L2-normalized embedding from a face crop."""
    session = _get_onnx_session()
    if session is None:
        return None

    input_tensor = _preprocess_for_facenet(crop)
    input_name = session.get_inputs()[0].name
    outputs = session.run(None, {input_name: input_tensor})
    embedding = outputs[0][0].astype(np.float64)

    norm = np.linalg.norm(embedding)
    if norm > 0:
        embedding = embedding / norm
    return embedding


# ---------------------------------------------------------------------------
# Similarity to score mapping
# ---------------------------------------------------------------------------

def _cosine_similarity(emb1: np.ndarray, emb2: np.ndarray) -> float:
    """Cosine similarity between two L2-normalized embeddings."""
    return float(np.dot(emb1, emb2))


def _embedding_sim_to_percent(sim: float) -> int:
    """Convert Facenet512 cosine similarity to 15-98 score.

    Facenet512 typical ranges:
    - Different people: -0.1 to 0.3
    - Somewhat similar:  0.3 to 0.5
    - Same person:       0.5 to 0.9+
    Score is more generous at the high end since raw >0.5 strongly
    indicates same identity.
    """
    sim = max(0.0, min(1.0, sim))
    breakpoints = [
        (0.0, 15), (0.1, 25), (0.25, 40), (0.4, 55),
        (0.55, 72), (0.7, 86), (0.8, 93), (1.0, 98),
    ]
    for i in range(1, len(breakpoints)):
        s0, p0 = breakpoints[i - 1]
        s1, p1 = breakpoints[i]
        if sim <= s1:
            t = (sim - s0) / (s1 - s0) if s1 > s0 else 0
            return int(round(p0 + t * (p1 - p0)))
    return 98


def _geometric_sim_to_percent(sim: float) -> int:
    """Convert geometric similarity (0-1) to 15-98 score.

    Geometric similarity has a different distribution than cosine:
    - Same person typically 0.6 - 0.95
    - Different people typically 0.1 - 0.6
    """
    sim = max(0.0, min(1.0, sim))
    breakpoints = [(0.0, 15), (0.2, 30), (0.4, 45), (0.6, 60), (0.8, 78), (0.9, 88), (1.0, 98)]
    for i in range(1, len(breakpoints)):
        s0, p0 = breakpoints[i - 1]
        s1, p1 = breakpoints[i]
        if sim <= s1:
            t = (sim - s0) / (s1 - s0) if s1 > s0 else 0
            return int(round(p0 + t * (p1 - p0)))
    return 98


# ---------------------------------------------------------------------------
# Geometric ratios (for fun facts display in service layer)
# ---------------------------------------------------------------------------

def compute_geometric_ratios(landmarks: list, w: int, h: int) -> dict[str, float]:
    """Compute facial geometric ratios for fun fact descriptions."""
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
    """Compare two faces: overall via Facenet512, regions via geometry.

    Returns dict with 'regions' (per-region scores) and 'overall_score'.
    Raises RuntimeError if ONNX model is unavailable.
    """
    # Extract geometric features for both faces
    feats1 = _extract_geometric_features(landmarks1, w1, h1)
    feats2 = _extract_geometric_features(landmarks2, w2, h2)

    if feats1 is None or feats2 is None:
        feats1 = feats1 or {}
        feats2 = feats2 or {}

    # Per-region geometric similarity
    region_specs = {
        "eyes": _EYES_FEATURES,
        "nose": _NOSE_FEATURES,
        "mouth": _MOUTH_FEATURES,
        "jawline": _JAWLINE_FEATURES,
    }
    regions: dict[str, dict[str, Any]] = {}
    for region_name, spec in region_specs.items():
        raw_sim = _compute_region_similarity(feats1, feats2, spec)
        score = _geometric_sim_to_percent(raw_sim)
        regions[region_name] = {"score": score, "raw_similarity": raw_sim}

    # Overall face: Facenet512 embedding comparison on full face crop
    crop1 = _crop_full_face(img1, landmarks1, w1, h1)
    crop2 = _crop_full_face(img2, landmarks2, w2, h2)
    emb1 = _extract_embedding(crop1)
    emb2 = _extract_embedding(crop2)

    if emb1 is None or emb2 is None:
        raise RuntimeError("Facenet512 ONNX model unavailable")

    full_sim = _cosine_similarity(emb1, emb2)
    overall_score = _embedding_sim_to_percent(full_sim)
    regions["overall_face"] = {"score": overall_score, "raw_similarity": full_sim}

    # Geometric ratios for fun facts
    ratios1 = compute_geometric_ratios(landmarks1, w1, h1)
    ratios2 = compute_geometric_ratios(landmarks2, w2, h2)

    return {
        "regions": regions,
        "overall_score": overall_score,
        "ratios1": ratios1,
        "ratios2": ratios2,
    }
