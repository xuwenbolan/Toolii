"""Pre-analysis face compliance validation for FaceMap pipeline.

Consolidates all quality and compliance checks that must pass before
feature extraction runs.  Each check raises AppError(status_code=422)
with a specific error code so the frontend can show targeted guidance.
"""

from __future__ import annotations

import math

import cv2
import numpy as np

from app.core.exceptions import AppError

# ---------------------------------------------------------------------------
# Thresholds (module-level for easy tuning)
# ---------------------------------------------------------------------------

MAX_FACE_COUNT = 1
MIN_FACE_AREA_RATIO = 0.05
MAX_EYE_TILT_DEG = 25.0
MIN_IPD_PIXELS = 40.0
MAX_YAW_RATIO = 0.35
MAX_BLINK_SCORE = 0.55
MAX_EXPRESSION_SCORE = 0.50
MIN_FACE_SHARPNESS = 45.0

# Face oval contour landmark indices (for bounding-box computation)
_FACE_OVAL = [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
    397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
    172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
]

# Blendshape weights for the expression composite score.
# Weights sum to 1.0 so the result is a normalised average.
_EXPRESSION_WEIGHTS: dict[str, float] = {
    "jawOpen": 0.30,
    "mouthSmileLeft": 0.10,
    "mouthSmileRight": 0.10,
    "mouthFrownLeft": 0.10,
    "mouthFrownRight": 0.10,
    "browDownLeft": 0.05,
    "browDownRight": 0.05,
    "cheekPuff": 0.10,
    "mouthFunnel": 0.05,
    "mouthPucker": 0.05,
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _blendshape_map(blendshapes: list) -> dict[str, float]:
    """Build name -> score mapping from MediaPipe blendshape categories."""
    return {cat.category_name: cat.score for cat in blendshapes}


# ---------------------------------------------------------------------------
# Individual checks (private, each raises AppError on failure)
# ---------------------------------------------------------------------------

def _check_multi_face(face_count: int) -> None:
    if face_count > MAX_FACE_COUNT:
        raise AppError(
            code="FACE_MULTI_DETECTED",
            message="Multiple faces detected. Please upload a photo with only one person.",
            status_code=422,
        )


def _check_face_size(landmarks: list, width: int, height: int) -> None:
    xs = [landmarks[i].x * width for i in _FACE_OVAL]
    ys = [landmarks[i].y * height for i in _FACE_OVAL]
    face_area = (max(xs) - min(xs)) * (max(ys) - min(ys))
    image_area = width * height
    if image_area > 0 and face_area / image_area < MIN_FACE_AREA_RATIO:
        raise AppError(
            code="FACE_TOO_SMALL",
            message="Face is too small in the frame. Please take a closer photo.",
            status_code=422,
        )


def _check_eye_tilt(
    landmarks: list, width: int, height: int,
) -> tuple[float, float, float, float]:
    """Check eye-line tilt. Returns (lx, ly, rx, ry) iris pixel coords for reuse."""
    lx = landmarks[468].x * width
    ly = landmarks[468].y * height
    rx = landmarks[473].x * width
    ry = landmarks[473].y * height
    dx = abs(rx - lx)
    dy = abs(ry - ly)
    if dx > 1.0:
        tilt_deg = math.degrees(math.atan2(dy, dx))
        if tilt_deg > MAX_EYE_TILT_DEG:
            raise AppError(
                code="FACE_TILTED",
                message="Face is tilted too much. Please hold the camera level and face forward.",
                status_code=422,
            )
    return lx, ly, rx, ry


def _check_ipd(ipd: float) -> None:
    if ipd < MIN_IPD_PIXELS:
        raise AppError(
            code="FACE_LOW_RESOLUTION",
            message="Face resolution is too low. Please move closer or use a higher-resolution photo.",
            status_code=422,
        )


def _check_yaw(landmarks: list, width: int, ipd: float) -> None:
    """Reject side-facing pose via nose-tip offset from eye midpoint."""
    if ipd < 1.0:
        return
    nose_tip_x = landmarks[1].x * width
    eye_mid_x = (landmarks[468].x * width + landmarks[473].x * width) / 2.0
    yaw_ratio = abs(nose_tip_x - eye_mid_x) / ipd
    if yaw_ratio > MAX_YAW_RATIO:
        raise AppError(
            code="FACE_SIDE_POSE",
            message="Face is turned too far to the side. Please face the camera directly.",
            status_code=422,
        )


def _check_eye_closure(bs_map: dict[str, float]) -> None:
    blink_l = bs_map.get("eyeBlinkLeft", 0.0)
    blink_r = bs_map.get("eyeBlinkRight", 0.0)
    if (blink_l + blink_r) / 2.0 > MAX_BLINK_SCORE:
        raise AppError(
            code="FACE_EYES_CLOSED",
            message="Eyes appear closed. Please keep your eyes open for the photo.",
            status_code=422,
        )


def _check_extreme_expression(bs_map: dict[str, float]) -> None:
    score = sum(
        weight * bs_map.get(name, 0.0)
        for name, weight in _EXPRESSION_WEIGHTS.items()
    )
    if score > MAX_EXPRESSION_SCORE:
        raise AppError(
            code="FACE_EXTREME_EXPRESSION",
            message="Extreme facial expression detected. Please maintain a natural, relaxed expression.",
            status_code=422,
        )


def _check_blur(
    landmarks: list, width: int, height: int, image_bytes: bytes,
) -> None:
    xs = [lm.x * width for lm in landmarks]
    ys = [lm.y * height for lm in landmarks]
    x_min = max(0, int(min(xs)))
    y_min = max(0, int(min(ys)))
    x_max = min(width, int(max(xs)) + 1)
    y_max = min(height, int(max(ys)) + 1)

    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
    if img is None:
        return
    from app.core.file_validation import check_cv2_image_size
    check_cv2_image_size(img)

    face_roi = img[y_min:y_max, x_min:x_max]
    if face_roi.size == 0:
        return

    sharpness = float(cv2.Laplacian(face_roi, cv2.CV_64F).var())
    if sharpness < MIN_FACE_SHARPNESS:
        raise AppError(
            code="FACE_BLURRY",
            message="Photo is too blurry. Please use a clearer, sharper photo.",
            status_code=422,
        )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def validate_face_compliance(
    *,
    landmarks: list,
    blendshapes: list,
    width: int,
    height: int,
    face_count: int,
    image_bytes: bytes | None = None,
    strict: bool = True,
) -> None:
    """Run face compliance checks before analysis.

    Raises AppError(status_code=422) with a specific error code on the
    first failing check.  Checks are ordered cheapest-first.

    When strict=False (e.g. for face similarity), expression and eye
    closure checks are skipped, and tilt/yaw thresholds are relaxed.
    """
    # 1. Multi-face
    _check_multi_face(face_count)

    # 2. Face size
    _check_face_size(landmarks, width, height)

    # 3. Eye tilt (returns iris coords for reuse)
    if strict:
        lx, ly, rx, ry = _check_eye_tilt(landmarks, width, height)
    else:
        # Relaxed: compute coords but use wider threshold
        lx = landmarks[468].x * width
        ly = landmarks[468].y * height
        rx = landmarks[473].x * width
        ry = landmarks[473].y * height
        dx = abs(rx - lx)
        dy = abs(ry - ly)
        if dx > 1.0:
            tilt_deg = math.degrees(math.atan2(dy, dx))
            if tilt_deg > 35.0:
                raise AppError(
                    code="FACE_TILTED",
                    message="Face is tilted too much. Please hold the camera level.",
                    status_code=422,
                )

    # 4. IPD
    ipd = math.hypot(rx - lx, ry - ly)
    _check_ipd(ipd)

    # 5. Yaw (relaxed threshold when not strict)
    if strict:
        _check_yaw(landmarks, width, ipd)
    else:
        if ipd >= 1.0:
            nose_tip_x = landmarks[1].x * width
            eye_mid_x = (landmarks[468].x * width + landmarks[473].x * width) / 2.0
            yaw_ratio = abs(nose_tip_x - eye_mid_x) / ipd
            if yaw_ratio > 0.45:
                raise AppError(
                    code="FACE_SIDE_POSE",
                    message="Face is turned too far to the side.",
                    status_code=422,
                )

    # 6-7. Blendshape-based checks (skip in relaxed mode)
    if strict:
        bs_map = _blendshape_map(blendshapes)
        _check_eye_closure(bs_map)
        _check_extreme_expression(bs_map)

    # 8. Blur (most expensive -- requires image decode)
    if image_bytes is not None:
        _check_blur(landmarks, width, height, image_bytes)
