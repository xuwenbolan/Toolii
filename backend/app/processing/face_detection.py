from __future__ import annotations

import logging
import threading
from functools import lru_cache
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
        logger.warning("httpx not available for model download, will use Haar fallback")
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
        logger.warning("Failed to download face_landmarker.task, will use Haar fallback", exc_info=True)
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
            logger.warning("mediapipe.tasks not available, will use Haar fallback")
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
            logger.warning(
                "Failed to initialize FaceLandmarker, will use Haar fallback",
                exc_info=True,
            )
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

# Eye contour indices for fallback / bounding box synthesis
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
    # Map to match Haar eye_openness scale (~0.14-0.5 range)
    eye_openness = (1.0 - avg_blink) * 0.5

    smile_left = bs_map.get(_BS_SMILE_LEFT, 0.0)
    smile_right = bs_map.get(_BS_SMILE_RIGHT, 0.0)
    smile_detected = (smile_left + smile_right) / 2.0 > 0.3

    # Build landmarks dict (matching Haar output format)
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
    # Sort by x to match left/right ordering
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
        logger.warning("mediapipe not importable, falling back to Haar")
        return None

    try:
        mp_image = MpImage(image_format=ImageFormat.SRGB, data=rgb)
        with _landmarker_lock:
            result = landmarker.detect(mp_image)
    except (RuntimeError, OSError, ValueError):
        logger.warning("MediaPipe detection failed, falling back to Haar", exc_info=True)
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
# OpenCV Haar cascade fallback (original implementation)
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


@lru_cache(maxsize=8)
def _get_cascade(filename: str) -> cv2.CascadeClassifier | None:
    path = cv2.data.haarcascades + filename
    classifier = cv2.CascadeClassifier(path)
    if classifier.empty():
        return None
    return classifier


def _detect_with_cascade(
    gray: np.ndarray,
    *,
    filename: str,
    scale_factor: float,
    min_neighbors: int,
    min_size: tuple[int, int],
) -> list[tuple[int, int, int, int]]:
    classifier = _get_cascade(filename)
    if classifier is None:
        return []
    detections = classifier.detectMultiScale(
        gray,
        scaleFactor=scale_factor,
        minNeighbors=min_neighbors,
        minSize=min_size,
    )
    return [(int(x), int(y), int(w), int(h)) for x, y, w, h in detections]


def _detect_frontal_faces(gray: np.ndarray) -> list[FaceBox]:
    detections = _detect_with_cascade(
        gray,
        filename="haarcascade_frontalface_default.xml",
        scale_factor=1.1,
        min_neighbors=5,
        min_size=(40, 40),
    )
    return [{"x": x, "y": y, "w": w, "h": h, "confidence": 0.85} for x, y, w, h in detections]


def _detect_profile_faces(gray: np.ndarray) -> list[FaceBox]:
    faces: list[FaceBox] = []
    width = gray.shape[1]
    detections = _detect_with_cascade(
        gray,
        filename="haarcascade_profileface.xml",
        scale_factor=1.1,
        min_neighbors=5,
        min_size=(40, 40),
    )
    for x, y, w, h in detections:
        faces.append({"x": x, "y": y, "w": w, "h": h, "confidence": 0.72})

    flipped = cv2.flip(gray, 1)
    detections_flipped = _detect_with_cascade(
        flipped,
        filename="haarcascade_profileface.xml",
        scale_factor=1.1,
        min_neighbors=5,
        min_size=(40, 40),
    )
    for x, y, w, h in detections_flipped:
        orig_x = width - (x + w)
        faces.append({"x": orig_x, "y": y, "w": w, "h": h, "confidence": 0.72})

    return faces


def _dedupe_face_boxes(faces: list[FaceBox]) -> list[FaceBox]:
    deduped: list[FaceBox] = []
    for face in sorted(faces, key=lambda item: item["w"] * item["h"], reverse=True):
        cx = face["x"] + face["w"] / 2
        cy = face["y"] + face["h"] / 2
        keep = True
        for existing in deduped:
            ex = existing["x"] + existing["w"] / 2
            ey = existing["y"] + existing["h"] / 2
            dist = ((cx - ex) ** 2 + (cy - ey) ** 2) ** 0.5
            threshold = min(face["w"], face["h"], existing["w"], existing["h"]) * 0.35
            if dist < threshold:
                keep = False
                break
        if keep:
            deduped.append(face)
    return deduped


def _detect_eyes(gray: np.ndarray, face: FaceBox) -> list[dict[str, int]]:
    x, y, w, h = int(face["x"]), int(face["y"]), int(face["w"]), int(face["h"])
    top_h = max(1, int(h * 0.62))
    roi = gray[y : y + top_h, x : x + w]
    if roi.size == 0:
        return []

    detections: list[tuple[int, int, int, int]] = []
    for filename in ("haarcascade_eye_tree_eyeglasses.xml", "haarcascade_eye.xml"):
        detections.extend(
            _detect_with_cascade(
                roi,
                filename=filename,
                scale_factor=1.08,
                min_neighbors=4,
                min_size=(max(12, w // 12), max(8, h // 14)),
            )
        )

    eyes: list[dict[str, int]] = []
    for ex, ey, ew, eh in detections:
        if ew <= 0 or eh <= 0:
            continue
        ratio = ew / max(eh, 1)
        if ratio < 1.1 or ratio > 6.0:
            continue
        if ey > top_h * 0.75:
            continue
        eyes.append(
            {
                "x": x + ex,
                "y": y + ey,
                "w": ew,
                "h": eh,
            }
        )

    # Deduplicate overlapping detections.
    deduped: list[dict[str, int]] = []
    for eye in sorted(eyes, key=lambda item: item["w"] * item["h"], reverse=True):
        ecx = eye["x"] + eye["w"] / 2
        ecy = eye["y"] + eye["h"] / 2
        keep = True
        for existing in deduped:
            x_overlap = min(eye["x"] + eye["w"], existing["x"] + existing["w"]) - max(eye["x"], existing["x"])
            y_overlap = min(eye["y"] + eye["h"], existing["y"] + existing["h"]) - max(eye["y"], existing["y"])
            if x_overlap > 0 and y_overlap > 0:
                keep = False
                break
            dist = ((ecx - (existing["x"] + existing["w"] / 2)) ** 2 + (ecy - (existing["y"] + existing["h"] / 2)) ** 2) ** 0.5
            if dist < min(eye["w"], existing["w"]) * 0.6:
                keep = False
                break
        if keep:
            deduped.append(eye)

    # Prefer one left + one right eye with largest separation.
    if len(deduped) <= 2:
        return sorted(deduped, key=lambda item: item["x"])

    best_pair: tuple[dict[str, int], dict[str, int]] | None = None
    best_score = -1.0
    for i in range(len(deduped)):
        for j in range(i + 1, len(deduped)):
            a = deduped[i]
            b = deduped[j]
            acx = a["x"] + a["w"] / 2
            bcx = b["x"] + b["w"] / 2
            if abs(acx - bcx) < w * 0.12:
                continue
            ay = a["y"] + a["h"] / 2
            by = b["y"] + b["h"] / 2
            vertical_penalty = abs(ay - by)
            separation = abs(acx - bcx)
            score = separation - vertical_penalty * 1.2
            if score > best_score:
                best_score = score
                best_pair = (a, b)

    if best_pair is None:
        return sorted(deduped[:2], key=lambda item: item["x"])
    return sorted([best_pair[0], best_pair[1]], key=lambda item: item["x"])


def _detect_smiles(gray: np.ndarray, face: FaceBox) -> list[dict[str, int]]:
    x, y, w, h = int(face["x"]), int(face["y"]), int(face["w"]), int(face["h"])
    start_y = y + int(h * 0.42)
    roi = gray[start_y : y + h, x : x + w]
    if roi.size == 0:
        return []

    detections = _detect_with_cascade(
        roi,
        filename="haarcascade_smile.xml",
        scale_factor=1.15,
        min_neighbors=18,
        min_size=(max(22, w // 5), max(10, h // 10)),
    )

    smiles: list[dict[str, int]] = []
    for sx, sy, sw, sh in detections:
        ratio = sw / max(sh, 1)
        if ratio < 1.3 or ratio > 8.0:
            continue
        smiles.append({"x": x + sx, "y": start_y + sy, "w": sw, "h": sh})
    smiles.sort(key=lambda item: item["w"] * item["h"], reverse=True)
    return smiles[:2]


def _center_of(box: dict[str, int]) -> tuple[float, float]:
    return (box["x"] + box["w"] / 2, box["y"] + box["h"] / 2)


def _build_face_features(face: FaceBox, gray: np.ndarray) -> dict[str, Any]:
    x, y, w, h = int(face["x"]), int(face["y"]), int(face["w"]), int(face["h"])
    eyes = _detect_eyes(gray, face)
    smiles = _detect_smiles(gray, face)

    landmarks: dict[str, list[float] | float | int | bool] = {
        "eyes_detected": len(eyes),
        "smile_detected": bool(smiles),
    }

    if len(eyes) >= 2:
        left_eye, right_eye = eyes[0], eyes[1]
        left_center = _center_of(left_eye)
        right_center = _center_of(right_eye)
        eye_dx = right_center[0] - left_center[0]
        eye_dy = right_center[1] - left_center[1]
        eye_dist = float((eye_dx**2 + eye_dy**2) ** 0.5)
        eye_angle_deg = float(np.degrees(np.arctan2(eye_dy, eye_dx))) if eye_dist > 0 else 0.0
        landmarks["left_eye"] = [float(left_center[0]), float(left_center[1])]
        landmarks["right_eye"] = [float(right_center[0]), float(right_center[1])]
        landmarks["eye_distance"] = eye_dist
        landmarks["eye_angle_deg"] = eye_angle_deg
    else:
        # Estimated eyes for downstream crop/compliance fallback.
        landmarks["left_eye"] = [float(x + w * 0.33), float(y + h * 0.4)]
        landmarks["right_eye"] = [float(x + w * 0.67), float(y + h * 0.4)]
        landmarks["eye_distance"] = float(w * 0.34)
        landmarks["eye_angle_deg"] = 0.0

    if smiles:
        smile_center = _center_of(smiles[0])
        landmarks["mouth"] = [float(smile_center[0]), float(smile_center[1] + smiles[0]["h"] * 0.15)]
        landmarks["smile_box"] = [int(smiles[0]["x"]), int(smiles[0]["y"]), int(smiles[0]["w"]), int(smiles[0]["h"])]
    else:
        landmarks["mouth"] = [float(x + w * 0.5), float(y + h * 0.75)]

    landmarks["chin"] = [float(x + w * 0.5), float(y + h * 1.02)]
    landmarks["head_top_guess"] = [float(x + w * 0.5), float(y - h * 0.18)]

    eye_boxes = []
    for eye in eyes:
        eye_boxes.append({k: int(v) for k, v in eye.items()})
    smile_boxes = []
    for smile in smiles:
        smile_boxes.append({k: int(v) for k, v in smile.items()})

    return {
        "landmarks": landmarks,
        "features": {
            "eyes": eye_boxes,
            "smiles": smile_boxes,
        },
    }


def _fallback_face_box(width: int, height: int) -> FaceBox:
    box_w = max(1, int(width * 0.42))
    box_h = max(1, int(height * 0.52))
    x = max(0, (width - box_w) // 2)
    y = max(0, int(height * 0.2))
    if y + box_h > height:
        y = max(0, height - box_h)
    return {"x": x, "y": y, "w": box_w, "h": box_h, "confidence": 0.2}


def _normalize_face_payload(face: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(face)
    normalized["x"] = int(face["x"])
    normalized["y"] = int(face["y"])
    normalized["w"] = int(face["w"])
    normalized["h"] = int(face["h"])
    normalized["confidence"] = float(face.get("confidence", 0.0))
    return normalized


def _detect_with_haar(img: np.ndarray) -> dict[str, object]:
    """Haar cascade detection path (fallback)."""
    height, width = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    faces = _detect_frontal_faces(gray)
    engine = "opencv-haar-frontal"

    if not faces:
        faces = _detect_profile_faces(gray)
        engine = "opencv-haar-profile" if faces else engine

    if not faces:
        face = _fallback_face_box(width, height)
        faces = [face]
        engine = "fallback-center"

    enriched: list[dict[str, Any]] = []
    for face in _dedupe_face_boxes(faces):
        payload = _normalize_face_payload(face)
        payload.update(_build_face_features(payload, gray))
        enriched.append(payload)

    enriched.sort(key=lambda item: item["w"] * item["h"], reverse=True)
    return {
        "width": int(width),
        "height": int(height),
        "faces": enriched,
        "engine": engine,
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def detect_faces(image_bytes: bytes) -> dict[str, object]:
    img = _decode_image(image_bytes)

    # Try MediaPipe first
    mp_result = _detect_with_mediapipe(img)
    if mp_result is not None:
        return mp_result

    # Fall back to Haar cascades
    return _detect_with_haar(img)


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
