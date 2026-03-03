from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Any, TypedDict

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# MediaPipe FaceLandmarker model management
# ---------------------------------------------------------------------------

_MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
)
_MODELS_DIR = Path(__file__).resolve().parents[3] / "models"
_MODEL_PATH = _MODELS_DIR / "face_landmarker.task"

_landmarker_lock = threading.Lock()
_landmarker_instance: Any = None
_landmarker_init_attempted = False


def _ensure_model_file() -> Path | None:
    """Return the model path if available, downloading if needed."""
    if _MODEL_PATH.exists() and _MODEL_PATH.stat().st_size > 1_000_000:
        return _MODEL_PATH
    try:
        import httpx
    except ImportError:
        logger.warning("httpx not available for model download")
        return None

    try:
        _MODELS_DIR.mkdir(parents=True, exist_ok=True)
        tmp = _MODEL_PATH.with_suffix(".tmp")
        logger.info("Downloading face_landmarker.task ...")
        resp = httpx.get(_MODEL_URL, follow_redirects=True, timeout=120.0)
        resp.raise_for_status()
        tmp.write_bytes(resp.content)
        tmp.rename(_MODEL_PATH)
        logger.info("Downloaded face_landmarker.task (%d bytes)", len(resp.content))
        return _MODEL_PATH
    except (httpx.HTTPError, OSError):
        logger.warning("Failed to download face_landmarker.task", exc_info=True)
        return None


def _get_landmarker() -> Any:
    """Get or create the FaceLandmarker singleton. Thread-safe."""
    global _landmarker_instance, _landmarker_init_attempted  # noqa: PLW0603

    if _landmarker_instance is not None:
        return _landmarker_instance
    if _landmarker_init_attempted:
        return None

    with _landmarker_lock:
        if _landmarker_instance is not None:
            return _landmarker_instance
        if _landmarker_init_attempted:
            return None

        _landmarker_init_attempted = True
        model_path = _ensure_model_file()
        if model_path is None:
            return None

        try:
            from mediapipe.tasks.python.core.base_options import BaseOptions
            from mediapipe.tasks.python.vision.face_landmarker import (
                FaceLandmarker,
                FaceLandmarkerOptions,
            )
        except ImportError:
            logger.warning("mediapipe.tasks not available")
            return None

        try:
            options = FaceLandmarkerOptions(
                base_options=BaseOptions(model_asset_path=str(model_path)),
                num_faces=5,
                min_face_detection_confidence=0.5,
                min_face_presence_confidence=0.5,
                output_face_blendshapes=True,
                output_facial_transformation_matrixes=False,
            )
            _landmarker_instance = FaceLandmarker.create_from_options(options)
            logger.info("MediaPipe FaceLandmarker initialized successfully")
            return _landmarker_instance
        except (RuntimeError, OSError, ValueError):
            logger.warning("Failed to initialize FaceLandmarker", exc_info=True)
            return None


def prewarm_face_landmarker() -> bool:
    """Pre-download model and initialize FaceLandmarker. Returns True if ready."""
    landmarker = _get_landmarker()
    return landmarker is not None


# ---------------------------------------------------------------------------
# MediaPipe landmark indices (478-point face mesh)
# ---------------------------------------------------------------------------

# Iris centers (landmarks 468-477 are iris points)
_MP_RIGHT_IRIS_CENTER = 473  # Image-left eye (subject's right eye)
_MP_LEFT_IRIS_CENTER = 468   # Image-right eye (subject's left eye)

# Eye contour indices for bounding box synthesis
_MP_RIGHT_EYE_CONTOUR = [33, 7, 163, 144, 145, 153, 154, 155, 133, 246, 161, 160, 159, 158, 157, 173]
_MP_LEFT_EYE_CONTOUR = [263, 249, 390, 373, 374, 380, 381, 382, 362, 466, 388, 387, 386, 385, 384, 398]

_MP_UPPER_LIP_MID = 13
_MP_LOWER_LIP_MID = 14
_MP_CHIN = 152
_MP_FOREHEAD_TOP = 10

# Blendshape indices
_BS_BLINK_LEFT = 9
_BS_BLINK_RIGHT = 10
_BS_SMILE_LEFT = 44
_BS_SMILE_RIGHT = 45


def _lm_px(landmarks: list, idx: int, w: int, h: int) -> tuple[float, float]:
    """Convert a normalized landmark to pixel coordinates."""
    lm = landmarks[idx]
    return (float(lm.x) * w, float(lm.y) * h)


def _contour_center(landmarks: list, indices: list[int], w: int, h: int) -> tuple[float, float]:
    """Compute the centroid of a set of landmark indices."""
    xs = [landmarks[i].x * w for i in indices]
    ys = [landmarks[i].y * h for i in indices]
    return (sum(xs) / len(xs), sum(ys) / len(ys))


def _eye_box_from_contour(landmarks: list, indices: list[int], w: int, h: int) -> dict[str, int]:
    """Synthesize an eye bounding box from contour landmarks."""
    xs = [landmarks[i].x * w for i in indices]
    ys = [landmarks[i].y * h for i in indices]
    x_min = int(min(xs))
    y_min = int(min(ys))
    return {
        "x": max(0, x_min),
        "y": max(0, y_min),
        "w": max(1, int(max(xs)) - x_min),
        "h": max(1, int(max(ys)) - y_min),
    }


def _bbox_from_landmarks(landmarks: list, w: int, h: int) -> tuple[int, int, int, int]:
    """Compute tight bounding box from all face mesh landmarks."""
    xs = [lm.x * w for lm in landmarks]
    ys = [lm.y * h for lm in landmarks]
    x_min = max(0, int(min(xs)))
    y_min = max(0, int(min(ys)))
    x_max = min(w, int(max(xs)) + 1)
    y_max = min(h, int(max(ys)) + 1)
    return x_min, y_min, x_max - x_min, y_max - y_min


def _mediapipe_face_to_payload(
    face_landmarks: list,
    blendshapes: list,
    width: int,
    height: int,
) -> dict[str, Any]:
    """Convert MediaPipe face result to the dict format expected by callers."""
    lms = face_landmarks

    # Bounding box
    bx, by, bw, bh = _bbox_from_landmarks(lms, width, height)

    # Eye centers
    if len(lms) > _MP_RIGHT_IRIS_CENTER:
        eye_left_px = _lm_px(lms, _MP_RIGHT_IRIS_CENTER, width, height)
        eye_right_px = _lm_px(lms, _MP_LEFT_IRIS_CENTER, width, height)
    else:
        eye_left_px = _contour_center(lms, _MP_RIGHT_EYE_CONTOUR, width, height)
        eye_right_px = _contour_center(lms, _MP_LEFT_EYE_CONTOUR, width, height)

    # Ensure left_eye.x < right_eye.x (sorted by image x)
    if eye_left_px[0] > eye_right_px[0]:
        eye_left_px, eye_right_px = eye_right_px, eye_left_px

    # Eye geometry
    eye_dx = eye_right_px[0] - eye_left_px[0]
    eye_dy = eye_right_px[1] - eye_left_px[1]
    eye_dist = float((eye_dx**2 + eye_dy**2) ** 0.5)
    eye_angle = float(np.degrees(np.arctan2(eye_dy, eye_dx))) if eye_dist > 0 else 0.0

    # Mouth center
    lip_upper = _lm_px(lms, _MP_UPPER_LIP_MID, width, height)
    lip_lower = _lm_px(lms, _MP_LOWER_LIP_MID, width, height)
    mouth_px = ((lip_upper[0] + lip_lower[0]) / 2, (lip_upper[1] + lip_lower[1]) / 2)

    # Chin and head top
    chin_px = _lm_px(lms, _MP_CHIN, width, height)
    forehead_px = _lm_px(lms, _MP_FOREHEAD_TOP, width, height)
    face_span = chin_px[1] - forehead_px[1]
    head_top_px = (forehead_px[0], forehead_px[1] - face_span * 0.15)

    # Blendshape-derived features
    bs_map: dict[int, float] = {}
    for cat in blendshapes:
        bs_map[cat.index] = cat.score

    blink_left = bs_map.get(_BS_BLINK_LEFT, 0.0)
    blink_right = bs_map.get(_BS_BLINK_RIGHT, 0.0)
    avg_blink = (blink_left + blink_right) / 2.0
    eye_openness = (1.0 - avg_blink) * 0.5  # noqa: F841

    smile_left = bs_map.get(_BS_SMILE_LEFT, 0.0)
    smile_right = bs_map.get(_BS_SMILE_RIGHT, 0.0)
    smile_detected = (smile_left + smile_right) / 2.0 > 0.3

    landmarks: dict[str, Any] = {
        "eyes_detected": 2,
        "smile_detected": smile_detected,
        "left_eye": [float(eye_left_px[0]), float(eye_left_px[1])],
        "right_eye": [float(eye_right_px[0]), float(eye_right_px[1])],
        "eye_distance": eye_dist,
        "eye_angle_deg": eye_angle,
        "mouth": [float(mouth_px[0]), float(mouth_px[1])],
        "chin": [float(chin_px[0]), float(chin_px[1])],
        "head_top_guess": [float(head_top_px[0]), float(head_top_px[1])],
    }

    # Synthesize eye bounding boxes from contour landmarks
    eye_l_box = _eye_box_from_contour(lms, _MP_RIGHT_EYE_CONTOUR, width, height)
    eye_r_box = _eye_box_from_contour(lms, _MP_LEFT_EYE_CONTOUR, width, height)
    if eye_l_box["x"] > eye_r_box["x"]:
        eye_l_box, eye_r_box = eye_r_box, eye_l_box

    features: dict[str, Any] = {
        "eyes": [eye_l_box, eye_r_box],
        "smiles": [],
    }

    return {
        "x": bx,
        "y": by,
        "w": bw,
        "h": bh,
        "confidence": 0.95,
        "landmarks": landmarks,
        "features": features,
    }


def _detect_with_mediapipe(img: np.ndarray) -> dict[str, object] | None:
    """Try detection with MediaPipe FaceLandmarker. Returns None if unavailable."""
    landmarker = _get_landmarker()
    if landmarker is None:
        return None

    height, width = img.shape[:2]
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    try:
        from mediapipe import Image as MpImage, ImageFormat
    except ImportError:
        logger.warning("mediapipe not importable")
        return None

    try:
        mp_image = MpImage(image_format=ImageFormat.SRGB, data=rgb)
        with _landmarker_lock:
            result = landmarker.detect(mp_image)
    except (RuntimeError, OSError, ValueError):
        logger.warning("MediaPipe detection failed", exc_info=True)
        return None

    if not result.face_landmarks:
        return None

    faces: list[dict[str, Any]] = []
    for idx, face_lms in enumerate(result.face_landmarks):
        bs = result.face_blendshapes[idx] if idx < len(result.face_blendshapes) else []
        faces.append(_mediapipe_face_to_payload(face_lms, bs, width, height))

    faces.sort(key=lambda f: f["w"] * f["h"], reverse=True)
    return {
        "width": int(width),
        "height": int(height),
        "faces": faces,
        "engine": "mediapipe-face-landmarker",
    }


# ---------------------------------------------------------------------------
# Heuristic fallback (when MediaPipe is unavailable or finds no face)
# ---------------------------------------------------------------------------


class FaceBox(TypedDict, total=False):
    x: int
    y: int
    w: int
    h: int
    confidence: float


def _decode_image(image_bytes: bytes) -> np.ndarray:
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Invalid image")
    return img


def _fallback_face_box(width: int, height: int) -> FaceBox:
    box_w = max(1, int(width * 0.42))
    box_h = max(1, int(height * 0.52))
    x = max(0, (width - box_w) // 2)
    y = max(0, int(height * 0.2))
    if y + box_h > height:
        y = max(0, height - box_h)
    return {"x": x, "y": y, "w": box_w, "h": box_h, "confidence": 0.2}


def _fallback_landmarks(face: FaceBox) -> dict[str, Any]:
    """Build heuristic landmarks from a fallback face box."""
    x, y, w, h = int(face["x"]), int(face["y"]), int(face["w"]), int(face["h"])
    return {
        "landmarks": {
            "eyes_detected": 0,
            "smile_detected": False,
            "left_eye": [float(x + w * 0.33), float(y + h * 0.4)],
            "right_eye": [float(x + w * 0.67), float(y + h * 0.4)],
            "eye_distance": float(w * 0.34),
            "eye_angle_deg": 0.0,
            "mouth": [float(x + w * 0.5), float(y + h * 0.75)],
            "chin": [float(x + w * 0.5), float(y + h * 1.02)],
            "head_top_guess": [float(x + w * 0.5), float(y - h * 0.18)],
        },
        "features": {"eyes": [], "smiles": []},
    }


def _detect_fallback(img: np.ndarray) -> dict[str, Any]:
    """Return a heuristic center-estimated face when MediaPipe is unavailable."""
    height, width = img.shape[:2]
    face = _fallback_face_box(width, height)
    payload: dict[str, Any] = {
        "x": face["x"],
        "y": face["y"],
        "w": face["w"],
        "h": face["h"],
        "confidence": face["confidence"],
    }
    payload.update(_fallback_landmarks(face))
    return {
        "width": int(width),
        "height": int(height),
        "faces": [payload],
        "engine": "fallback-center",
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def detect_faces(image_bytes: bytes) -> dict[str, Any]:
    img = _decode_image(image_bytes)

    mp_result = _detect_with_mediapipe(img)
    if mp_result is not None:
        return mp_result

    return _detect_fallback(img)


LANDMARKER_UNAVAILABLE = "LANDMARKER_UNAVAILABLE"


def detect_face_landmarks(
    image_bytes: bytes,
) -> tuple[list, list, int, int, int] | str | None:
    """Return raw (landmarks, blendshapes, width, height, face_count) for the largest face.

    Used by physiognomy analysis to access all 478 mesh points directly.
    Returns:
        tuple: (landmarks, blendshapes, width, height, face_count) when face found.
        LANDMARKER_UNAVAILABLE: when MediaPipe model cannot be loaded.
        None: when no face detected in the image.
    """
    landmarker = _get_landmarker()
    if landmarker is None:
        return LANDMARKER_UNAVAILABLE

    img = _decode_image(image_bytes)
    height, width = img.shape[:2]
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    try:
        from mediapipe import Image as MpImage, ImageFormat
    except ImportError:
        return LANDMARKER_UNAVAILABLE

    try:
        mp_image = MpImage(image_format=ImageFormat.SRGB, data=rgb)
        with _landmarker_lock:
            result = landmarker.detect(mp_image)
    except (RuntimeError, OSError, ValueError):
        logger.warning("MediaPipe detection failed", exc_info=True)
        return None

    if not result.face_landmarks:
        return None

    face_count = len(result.face_landmarks)

    # Select the largest face by bounding box area
    best_idx = 0
    best_area = 0.0
    for i, lms in enumerate(result.face_landmarks):
        _, _, bw, bh = _bbox_from_landmarks(lms, width, height)
        area = bw * bh
        if area > best_area:
            best_area = area
            best_idx = i

    face_lms = result.face_landmarks[best_idx]
    bs = result.face_blendshapes[best_idx] if best_idx < len(result.face_blendshapes) else []
    return face_lms, bs, width, height, face_count


def select_primary_face(faces: list[FaceBox] | list[dict[str, object]] | None) -> dict[str, Any] | None:
    if not faces:
        return None
    first = dict(faces[0])
    first["x"] = int(first["x"])
    first["y"] = int(first["y"])
    first["w"] = int(first["w"])
    first["h"] = int(first["h"])
    first["confidence"] = float(first.get("confidence", 0.0))
    return first