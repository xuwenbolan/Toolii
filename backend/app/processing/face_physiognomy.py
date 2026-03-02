"""Extract physiognomy features from MediaPipe 478-point face mesh landmarks.

Pure computation module -- no I/O, no network, no database.
All functions accept raw MediaPipe NormalizedLandmark lists and image dimensions.
"""

from __future__ import annotations

import math
from typing import Any

# ---------------------------------------------------------------------------
# MediaPipe 478-point landmark index constants
# ---------------------------------------------------------------------------

# Face oval contour (for face shape analysis)
_FACE_OVAL = [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
    397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
    172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
]

# Forehead & chin
_FOREHEAD_TOP = 10
_CHIN_CENTER = 152

# Eyebrow indices
_RIGHT_EYEBROW = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46]
_LEFT_EYEBROW = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276]

# Eye contour indices (same as in face_detection.py)
_RIGHT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 246, 161, 160, 159, 158, 157, 173]
_LEFT_EYE = [263, 249, 390, 373, 374, 380, 381, 382, 362, 466, 388, 387, 386, 385, 384, 398]

# Eye corners: inner and outer (right eye: 33=outer, 133=inner; left eye: 362=outer, 263=inner)
_RIGHT_EYE_OUTER = 33
_RIGHT_EYE_INNER = 133
_LEFT_EYE_INNER = 362
_LEFT_EYE_OUTER = 263

# Iris centers
_RIGHT_IRIS_CENTER = 473
_LEFT_IRIS_CENTER = 468

# Nose
_NOSE_BRIDGE = [6, 197, 195, 5, 4]
_NOSE_TIP = 1
_NOSE_LEFT_WING = 129
_NOSE_RIGHT_WING = 358

# Mouth
_MOUTH_LEFT_CORNER = 61
_MOUTH_RIGHT_CORNER = 291
_UPPER_LIP_TOP = 0
_UPPER_LIP_MID = 13
_LOWER_LIP_MID = 14
_LOWER_LIP_BOTTOM = 17

# Jaw contour points (lower face)
_JAW_LEFT = [176, 149, 150, 136, 172, 58]
_JAW_RIGHT = [400, 378, 379, 365, 397, 288]
_JAW_CENTER = 152

# Cheekbone width reference points
_LEFT_CHEEK = 234
_RIGHT_CHEEK = 454

# Forehead width reference points
_FOREHEAD_LEFT = 21
_FOREHEAD_RIGHT = 251

# Eyebrow outer endpoints (for Parents Palace)
_RIGHT_BROW_OUTER = 46
_LEFT_BROW_OUTER = 276

# Under-eye lower contour (for Children Palace)
_RIGHT_LOWER_EYE = [153, 154, 155]
_LEFT_LOWER_EYE = [380, 381, 382]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _px(landmarks: list, idx: int, w: int, h: int) -> tuple[float, float]:
    """Convert normalized landmark to pixel coordinates."""
    lm = landmarks[idx]
    return float(lm.x) * w, float(lm.y) * h


def _dist(p1: tuple[float, float], p2: tuple[float, float]) -> float:
    """Euclidean distance between two points."""
    return math.hypot(p1[0] - p2[0], p1[1] - p2[1])


def _midpoint(p1: tuple[float, float], p2: tuple[float, float]) -> tuple[float, float]:
    return (p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2


def _centroid(landmarks: list, indices: list[int], w: int, h: int) -> tuple[float, float]:
    """Centroid of a set of landmarks."""
    xs = [landmarks[i].x * w for i in indices]
    ys = [landmarks[i].y * h for i in indices]
    return sum(xs) / len(xs), sum(ys) / len(ys)


def _contour_width(landmarks: list, indices: list[int], w: int, h: int) -> float:
    """Horizontal extent of a set of landmarks."""
    xs = [landmarks[i].x * w for i in indices]
    return max(xs) - min(xs)


def _contour_height(landmarks: list, indices: list[int], w: int, h: int) -> float:
    """Vertical extent of a set of landmarks."""
    ys = [landmarks[i].y * h for i in indices]
    return max(ys) - min(ys)


def _angle_deg(p1: tuple[float, float], p2: tuple[float, float]) -> float:
    """Angle (degrees) of the line from p1 to p2 relative to horizontal."""
    return math.degrees(math.atan2(p2[1] - p1[1], p2[0] - p1[0]))


def _max_perp_deviation(landmarks: list, indices: list[int], w: int, h: int) -> float:
    """Max perpendicular deviation of points from the line connecting first and last."""
    if len(indices) < 3:
        return 0.0
    pts = [_px(landmarks, i, w, h) for i in indices]
    p0, p1 = pts[0], pts[-1]
    line_len = _dist(p0, p1)
    if line_len < 1e-6:
        return 0.0
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    max_dev = 0.0
    for pt in pts[1:-1]:
        d = abs(dy * pt[0] - dx * pt[1] + p1[0] * p0[1] - p1[1] * p0[0]) / line_len
        max_dev = max(max_dev, d)
    return max_dev


def _proximity(value: float, center: float, sigma: float) -> float:
    """Gaussian proximity score: 1.0 at center, decaying with distance."""
    return math.exp(-0.5 * ((value - center) / sigma) ** 2)


def _top_two(scores: dict[str, float]) -> dict[str, Any]:
    """Normalize soft scores and return primary + secondary classification."""
    total = sum(scores.values()) or 1.0
    ranked = sorted(
        [(k, round(v / total, 3)) for k, v in scores.items()],
        key=lambda x: -x[1],
    )
    result: dict[str, Any] = {
        "shape_id": ranked[0][0],
        "confidence": ranked[0][1],
    }
    if len(ranked) > 1 and ranked[1][1] > 0.05:
        result["secondary_id"] = ranked[1][0]
        result["secondary_confidence"] = ranked[1][1]
    return result


# ---------------------------------------------------------------------------
# Feature classifiers (soft scoring with confidence)
# ---------------------------------------------------------------------------

def _classify_face_shape(
    width_height_ratio: float,
    forehead_ratio: float,
    cheekbone_ratio: float,
    jaw_ratio: float,
) -> dict[str, Any]:
    """Classify face shape with soft scoring and confidence.

    Returns dict with shape_id, confidence, and optional secondary classification.
    """
    jaw_to_cheek = jaw_ratio / cheekbone_ratio if cheekbone_ratio > 0 else 1.0
    forehead_to_cheek = forehead_ratio / cheekbone_ratio if cheekbone_ratio > 0 else 1.0

    scores = {
        "round":   _proximity(width_height_ratio, 0.90, 0.08) * _proximity(jaw_to_cheek, 0.93, 0.06),
        "square":  _proximity(width_height_ratio, 0.88, 0.07) * _proximity(jaw_to_cheek, 0.83, 0.06),
        "oval":    _proximity(width_height_ratio, 0.73, 0.09) * _proximity(jaw_to_cheek, 0.76, 0.08),
        "long":    _proximity(width_height_ratio, 0.62, 0.07) * _proximity(jaw_to_cheek, 0.85, 0.08),
        "diamond": _proximity(width_height_ratio, 0.76, 0.07) * _proximity(jaw_to_cheek, 0.74, 0.07) * _proximity(forehead_to_cheek, 0.82, 0.06),
        "heart":   _proximity(width_height_ratio, 0.76, 0.07) * _proximity(jaw_to_cheek, 0.72, 0.07) * _proximity(forehead_to_cheek, 0.98, 0.06),
        "pear":    _proximity(width_height_ratio, 0.80, 0.08) * _proximity(jaw_to_cheek, 1.02, 0.08),
    }
    return _top_two(scores)


def _classify_eye_shape(
    corner_angle: float,
    width_height_ratio: float,
) -> dict[str, Any]:
    """Classify eye shape with soft scoring and confidence."""
    scores = {
        "phoenix": _proximity(corner_angle, 10.0, 5.0) * _proximity(width_height_ratio, 3.0, 1.0),
        "droopy":  _proximity(corner_angle, -10.0, 5.0) * _proximity(width_height_ratio, 3.0, 1.0),
        "narrow":  _proximity(corner_angle, 0, 6.0) * _proximity(width_height_ratio, 4.5, 1.0),
        "round":   _proximity(corner_angle, 0, 6.0) * _proximity(width_height_ratio, 1.6, 0.5),
        "almond":  _proximity(corner_angle, 0, 5.0) * _proximity(width_height_ratio, 2.8, 0.7),
    }
    return _top_two(scores)


def _classify_nose_shape(
    length_ratio: float,
    width_ratio: float,
    straightness: float,
    face_height: float,
) -> dict[str, Any]:
    """Classify nose shape with soft scoring and confidence."""
    rel_straightness = straightness / face_height if face_height > 0 else 0.0
    straight_score = max(0.0, 1.0 - rel_straightness * 60)

    scores = {
        "straight":      _proximity(length_ratio, 0.34, 0.04) * _proximity(width_ratio, 0.25, 0.04) * _proximity(straight_score, 0.95, 0.15),
        "straight_long": _proximity(length_ratio, 0.42, 0.04) * _proximity(width_ratio, 0.25, 0.04) * _proximity(straight_score, 0.95, 0.15),
        "aquiline":      _proximity(length_ratio, 0.40, 0.05) * _proximity(straight_score, 0.40, 0.25),
        "snub":          _proximity(length_ratio, 0.27, 0.04) * _proximity(width_ratio, 0.22, 0.04),
        "snub_wide":     _proximity(length_ratio, 0.27, 0.04) * _proximity(width_ratio, 0.32, 0.05),
        "wide":          _proximity(width_ratio, 0.35, 0.05) * _proximity(length_ratio, 0.34, 0.06),
        "normal":        _proximity(length_ratio, 0.34, 0.05) * _proximity(width_ratio, 0.27, 0.04) * _proximity(straight_score, 0.70, 0.25),
    }
    return _top_two(scores)


def _classify_mouth_shape(
    width_ratio: float,
    lip_ratio: float,
    corner_angle: float,
) -> dict[str, Any]:
    """Classify mouth shape with soft scoring and confidence."""
    scores = {
        "small":      _proximity(width_ratio, 0.28, 0.04) * _proximity(lip_ratio, 0.85, 0.30),
        "wide":       _proximity(width_ratio, 0.52, 0.05) * _proximity(lip_ratio, 0.85, 0.30),
        "upper_full": _proximity(lip_ratio, 1.40, 0.20) * _proximity(width_ratio, 0.40, 0.08),
        "lower_full": _proximity(lip_ratio, 0.50, 0.15) * _proximity(width_ratio, 0.40, 0.08),
        "upturned":   _proximity(corner_angle, 5.0, 2.5) * _proximity(width_ratio, 0.40, 0.08),
        "downturned": _proximity(corner_angle, -5.0, 2.5) * _proximity(width_ratio, 0.40, 0.08),
        "balanced":   _proximity(width_ratio, 0.40, 0.06) * _proximity(lip_ratio, 0.85, 0.20) * _proximity(corner_angle, 0, 3.0),
    }
    return _top_two(scores)


def _classify_eyebrow_shape(
    arch_ratio: float,
    length_ratio: float,
    brow_eye_gap_ratio: float,
) -> dict[str, Any]:
    """Classify eyebrow shape with soft scoring and confidence."""
    scores = {
        "high_arch":     _proximity(arch_ratio, 0.28, 0.06) * _proximity(length_ratio, 0.78, 0.12),
        "straight":      _proximity(arch_ratio, 0.06, 0.04) * _proximity(length_ratio, 0.70, 0.10),
        "straight_long": _proximity(arch_ratio, 0.06, 0.04) * _proximity(length_ratio, 0.88, 0.08),
        "soft_arch":     _proximity(arch_ratio, 0.16, 0.05) * _proximity(length_ratio, 0.76, 0.10),
        "long_arch":     _proximity(arch_ratio, 0.18, 0.05) * _proximity(length_ratio, 0.90, 0.08),
    }
    return _top_two(scores)


def _classify_forehead(height_ratio: float) -> dict[str, Any]:
    """Classify forehead with soft scoring and confidence."""
    scores = {
        "high":   _proximity(height_ratio, 0.42, 0.06),
        "medium": _proximity(height_ratio, 0.33, 0.05),
        "low":    _proximity(height_ratio, 0.24, 0.05),
    }
    return _top_two(scores)


def _classify_jawline(
    jaw_width_ratio: float,
    jaw_angle_sharpness: float,
) -> dict[str, Any]:
    """Classify jawline with soft scoring and confidence."""
    scores = {
        "square":     _proximity(jaw_width_ratio, 0.90, 0.06) * _proximity(jaw_angle_sharpness, 0.80, 0.10),
        "wide_round": _proximity(jaw_width_ratio, 0.90, 0.06) * _proximity(jaw_angle_sharpness, 0.50, 0.10),
        "pointed":    _proximity(jaw_width_ratio, 0.65, 0.06) * _proximity(jaw_angle_sharpness, 0.50, 0.12),
        "angular":    _proximity(jaw_width_ratio, 0.78, 0.06) * _proximity(jaw_angle_sharpness, 0.70, 0.10),
        "moderate":   _proximity(jaw_width_ratio, 0.78, 0.06) * _proximity(jaw_angle_sharpness, 0.55, 0.10),
    }
    return _top_two(scores)


# ---------------------------------------------------------------------------
# Main extraction function
# ---------------------------------------------------------------------------

def extract_features(
    landmarks: list,
    width: int,
    height: int,
    blendshapes: list | None = None,
) -> dict[str, Any]:
    """Extract all physiognomy features from 478-point face mesh.

    Args:
        landmarks: Raw MediaPipe NormalizedLandmark list (478 points).
        width: Image width in pixels.
        height: Image height in pixels.
        blendshapes: Optional MediaPipe blendshape list for expression data.

    Returns:
        Structured dict with classified features and raw ratios.
    """
    if len(landmarks) < 478:
        raise ValueError(f"Expected 478 landmarks, got {len(landmarks)}")

    w, h = width, height

    # --- Parse blendshapes ---
    _BS_BLINK_LEFT = 9
    _BS_BLINK_RIGHT = 10
    _BS_SMILE_LEFT = 44
    _BS_SMILE_RIGHT = 45

    bs_map: dict[int, float] = {}
    if blendshapes:
        for cat in blendshapes:
            bs_map[cat.index] = cat.score

    blink_left = bs_map.get(_BS_BLINK_LEFT, 0.0)
    blink_right = bs_map.get(_BS_BLINK_RIGHT, 0.0)
    smile_left = bs_map.get(_BS_SMILE_LEFT, 0.0)
    smile_right = bs_map.get(_BS_SMILE_RIGHT, 0.0)

    # --- Reference measurements ---
    forehead_pt = _px(landmarks, _FOREHEAD_TOP, w, h)
    chin_pt = _px(landmarks, _CHIN_CENTER, w, h)
    face_height = _dist(forehead_pt, chin_pt)
    if face_height < 1.0:
        face_height = 1.0  # safety

    # Face width at three levels
    forehead_width = _dist(
        _px(landmarks, _FOREHEAD_LEFT, w, h),
        _px(landmarks, _FOREHEAD_RIGHT, w, h),
    )
    cheekbone_width = _dist(
        _px(landmarks, _LEFT_CHEEK, w, h),
        _px(landmarks, _RIGHT_CHEEK, w, h),
    )
    jaw_width = _dist(
        _centroid(landmarks, _JAW_LEFT[:3], w, h),
        _centroid(landmarks, _JAW_RIGHT[:3], w, h),
    )

    # --- Three Courts (san ting) ---
    right_brow_center = _centroid(landmarks, _RIGHT_EYEBROW, w, h)
    left_brow_center = _centroid(landmarks, _LEFT_EYEBROW, w, h)
    brow_mid = _midpoint(right_brow_center, left_brow_center)
    nose_tip = _px(landmarks, _NOSE_TIP, w, h)

    upper_court = brow_mid[1] - forehead_pt[1]
    middle_court = nose_tip[1] - brow_mid[1]
    lower_court = chin_pt[1] - nose_tip[1]
    court_total = upper_court + middle_court + lower_court
    if court_total < 1.0:
        court_total = 1.0

    three_courts = {
        "upper": round(upper_court / court_total, 3),
        "middle": round(middle_court / court_total, 3),
        "lower": round(lower_court / court_total, 3),
        "balanced": abs(upper_court - middle_court) / court_total < 0.05
        and abs(middle_court - lower_court) / court_total < 0.05,
    }

    # --- Five Eyes (wu yan) ---
    right_eye_outer = _px(landmarks, _RIGHT_EYE_OUTER, w, h)
    right_eye_inner = _px(landmarks, _RIGHT_EYE_INNER, w, h)
    left_eye_inner = _px(landmarks, _LEFT_EYE_INNER, w, h)
    left_eye_outer = _px(landmarks, _LEFT_EYE_OUTER, w, h)

    right_eye_width = _dist(right_eye_outer, right_eye_inner)
    left_eye_width = _dist(left_eye_inner, left_eye_outer)
    avg_eye_width = (right_eye_width + left_eye_width) / 2
    if avg_eye_width < 1.0:
        avg_eye_width = 1.0

    five_eyes_ratio = cheekbone_width / avg_eye_width

    five_eyes = {
        "ratio": round(five_eyes_ratio, 2),
        "ideal_deviation": round(abs(five_eyes_ratio - 5.0), 2),
        "balanced": abs(five_eyes_ratio - 5.0) < 0.5,
    }

    # --- Face Shape ---
    wh_ratio = cheekbone_width / face_height
    face_classification = _classify_face_shape(
        width_height_ratio=wh_ratio,
        forehead_ratio=forehead_width / face_height,
        cheekbone_ratio=cheekbone_width / face_height,
        jaw_ratio=jaw_width / face_height,
    )
    face_shape = {
        **face_classification,
        "width_height_ratio": round(wh_ratio, 3),
        "forehead_width_ratio": round(forehead_width / face_height, 3),
        "cheekbone_width_ratio": round(cheekbone_width / face_height, 3),
        "jaw_width_ratio": round(jaw_width / face_height, 3),
    }

    # --- Eye Shape ---
    def _analyze_eye(
        contour: list[int],
        outer_idx: int,
        inner_idx: int,
    ) -> dict[str, Any]:
        outer_pt = _px(landmarks, outer_idx, w, h)
        inner_pt = _px(landmarks, inner_idx, w, h)
        ew = _dist(outer_pt, inner_pt)
        eh = _contour_height(landmarks, contour, w, h)
        whr = ew / eh if eh > 0 else 3.0
        # Compute tilt consistently for both eyes using absolute horizontal
        # distance so left/right eyes produce the same sign convention:
        # positive = outer corner higher than inner (phoenix eye)
        # negative = outer corner lower than inner (droopy eye)
        horiz = abs(outer_pt[0] - inner_pt[0])
        vert = inner_pt[1] - outer_pt[1]  # positive when outer is higher (lower y in image)
        angle = math.degrees(math.atan2(vert, horiz)) if horiz > 0 else 0.0
        shape_id = _classify_eye_shape(angle, whr)
        return {
            "shape_id": shape_id,
            "width": round(ew, 1),
            "height": round(eh, 1),
            "width_height_ratio": round(whr, 2),
            "corner_angle": round(angle, 2),
        }

    left_eye_features = _analyze_eye(_LEFT_EYE, _LEFT_EYE_OUTER, _LEFT_EYE_INNER)
    right_eye_features = _analyze_eye(_RIGHT_EYE, _RIGHT_EYE_OUTER, _RIGHT_EYE_INNER)

    # Combined eye classification (use average)
    avg_eye_angle = (left_eye_features["corner_angle"] + right_eye_features["corner_angle"]) / 2
    avg_eye_whr = (left_eye_features["width_height_ratio"] + right_eye_features["width_height_ratio"]) / 2
    eye_classification = _classify_eye_shape(avg_eye_angle, avg_eye_whr)

    eyes = {
        **eye_classification,
        "left": left_eye_features,
        "right": right_eye_features,
        "inter_eye_distance": round(_dist(right_eye_inner, left_eye_inner) / avg_eye_width, 2),
    }

    # --- Nose ---
    nose_top = _px(landmarks, _NOSE_BRIDGE[0], w, h)
    nose_length = _dist(nose_top, nose_tip)
    nose_wing_left = _px(landmarks, _NOSE_LEFT_WING, w, h)
    nose_wing_right = _px(landmarks, _NOSE_RIGHT_WING, w, h)
    nose_width = _dist(nose_wing_left, nose_wing_right)
    bridge_deviation = _max_perp_deviation(landmarks, _NOSE_BRIDGE, w, h)

    nose_classification = _classify_nose_shape(
        length_ratio=nose_length / face_height,
        width_ratio=nose_width / cheekbone_width,
        straightness=bridge_deviation,
        face_height=face_height,
    )
    nose = {
        **nose_classification,
        "length_ratio": round(nose_length / face_height, 3),
        "width_ratio": round(nose_width / cheekbone_width, 3),
        "bridge_straightness": round(1.0 - min(bridge_deviation / face_height * 50, 1.0), 3),
    }

    # --- Mouth ---
    mouth_left = _px(landmarks, _MOUTH_LEFT_CORNER, w, h)
    mouth_right = _px(landmarks, _MOUTH_RIGHT_CORNER, w, h)
    mouth_width = _dist(mouth_left, mouth_right)

    upper_lip_top = _px(landmarks, _UPPER_LIP_TOP, w, h)
    upper_lip_mid = _px(landmarks, _UPPER_LIP_MID, w, h)
    lower_lip_mid = _px(landmarks, _LOWER_LIP_MID, w, h)
    lower_lip_bottom = _px(landmarks, _LOWER_LIP_BOTTOM, w, h)

    upper_thickness = _dist(upper_lip_top, upper_lip_mid)
    lower_thickness = _dist(lower_lip_mid, lower_lip_bottom)
    lip_ratio = upper_thickness / lower_thickness if lower_thickness > 0 else 1.0

    # Mouth corner tilt: measure how much corners sit above/below the lip
    # center (where lips meet). positive = upturned, negative = downturned.
    lip_center = _midpoint(upper_lip_mid, lower_lip_mid)
    right_horiz = abs(mouth_right[0] - lip_center[0])
    left_horiz = abs(mouth_left[0] - lip_center[0])
    right_tilt = math.degrees(math.atan2(lip_center[1] - mouth_right[1], right_horiz)) if right_horiz > 0 else 0.0
    left_tilt = math.degrees(math.atan2(lip_center[1] - mouth_left[1], left_horiz)) if left_horiz > 0 else 0.0
    corner_angle = (right_tilt + left_tilt) / 2

    # Enhance mouth corner detection with smile blendshape
    if blendshapes:
        avg_smile = (smile_left + smile_right) / 2.0
        if avg_smile > 0.15:
            corner_angle = max(-15.0, min(15.0, corner_angle + avg_smile * 3.0))

    mouth_classification = _classify_mouth_shape(
        width_ratio=mouth_width / cheekbone_width,
        lip_ratio=lip_ratio,
        corner_angle=corner_angle,
    )
    mouth = {
        **mouth_classification,
        "width_ratio": round(mouth_width / cheekbone_width, 3),
        "lip_ratio": round(lip_ratio, 3),
        "corner_angle": round(corner_angle, 2),
        "upper_thickness": round(upper_thickness, 1),
        "lower_thickness": round(lower_thickness, 1),
    }

    # --- Eyebrows ---
    def _analyze_eyebrow(
        indices: list[int],
        eye_contour: list[int],
    ) -> dict[str, Any]:
        brow_pts = [_px(landmarks, i, w, h) for i in indices]
        brow_xs = [p[0] for p in brow_pts]
        brow_ys = [p[1] for p in brow_pts]
        brow_width = max(brow_xs) - min(brow_xs)
        brow_top = min(brow_ys)
        brow_bottom = max(brow_ys)

        # Arch: max height deviation from the line connecting brow endpoints
        arch_dev = _max_perp_deviation(landmarks, indices, w, h)
        arch_ratio = arch_dev / brow_width if brow_width > 0 else 0.0

        # Length relative to eye width
        eye_w = _contour_width(landmarks, eye_contour, w, h)
        length_ratio = brow_width / eye_w if eye_w > 0 else 1.0

        # Brow-eye gap
        eye_top = min(landmarks[i].y * h for i in eye_contour)
        gap = eye_top - brow_bottom
        gap_ratio = gap / face_height if face_height > 0 else 0.05

        return {
            "arch_ratio": round(arch_ratio, 3),
            "length_ratio": round(length_ratio, 2),
            "brow_eye_gap_ratio": round(gap_ratio, 3),
        }

    left_brow = _analyze_eyebrow(_LEFT_EYEBROW, _LEFT_EYE)
    right_brow = _analyze_eyebrow(_RIGHT_EYEBROW, _RIGHT_EYE)

    avg_arch = (left_brow["arch_ratio"] + right_brow["arch_ratio"]) / 2
    avg_len = (left_brow["length_ratio"] + right_brow["length_ratio"]) / 2
    avg_gap = (left_brow["brow_eye_gap_ratio"] + right_brow["brow_eye_gap_ratio"]) / 2
    eyebrow_classification = _classify_eyebrow_shape(avg_arch, avg_len, avg_gap)

    eyebrows = {
        **eyebrow_classification,
        "left": left_brow,
        "right": right_brow,
        "arch_ratio": round(avg_arch, 3),
        "length_ratio": round(avg_len, 2),
    }

    # --- Forehead ---
    forehead_height = brow_mid[1] - forehead_pt[1]
    forehead_height_ratio = forehead_height / face_height
    forehead_classification = _classify_forehead(forehead_height_ratio)

    forehead = {
        **forehead_classification,
        "height_ratio": round(forehead_height_ratio, 3),
        "width_ratio": round(forehead_width / cheekbone_width, 3),
    }

    # --- Jawline ---
    jaw_to_cheek = jaw_width / cheekbone_width if cheekbone_width > 0 else 1.0
    # Jaw angle sharpness: how pointed the chin is relative to jaw width
    chin_to_jaw_left = _dist(chin_pt, _centroid(landmarks, _JAW_LEFT[:3], w, h))
    chin_to_jaw_right = _dist(chin_pt, _centroid(landmarks, _JAW_RIGHT[:3], w, h))
    avg_chin_jaw_dist = (chin_to_jaw_left + chin_to_jaw_right) / 2
    jaw_angle_sharpness = jaw_width / (2 * avg_chin_jaw_dist) if avg_chin_jaw_dist > 0 else 0.5

    jawline_classification = _classify_jawline(jaw_to_cheek, jaw_angle_sharpness)
    jawline = {
        **jawline_classification,
        "width_ratio": round(jaw_to_cheek, 3),
        "angle_sharpness": round(jaw_angle_sharpness, 3),
    }

    # --- Symmetry ---
    def _sym_score(left_val: float, right_val: float) -> float:
        avg = (abs(left_val) + abs(right_val)) / 2
        if avg < 1e-6:
            return 100.0
        diff_pct = abs(left_val - right_val) / avg * 100
        return max(0.0, 100.0 - diff_pct)

    sym_eyes = _sym_score(left_eye_features["width"], right_eye_features["width"])
    sym_brows = _sym_score(left_brow["arch_ratio"], right_brow["arch_ratio"])

    nose_left_dist = _dist(nose_tip, nose_wing_left)
    nose_right_dist = _dist(nose_tip, nose_wing_right)
    sym_nose = _sym_score(nose_left_dist, nose_right_dist)

    mouth_left_dist = _dist(_midpoint(mouth_left, mouth_right), mouth_left)
    mouth_right_dist = _dist(_midpoint(mouth_left, mouth_right), mouth_right)
    sym_mouth = _sym_score(mouth_left_dist, mouth_right_dist)

    # Integrate blink asymmetry from blendshapes into symmetry
    if blendshapes and (blink_left + blink_right) > 0.01:
        sym_blink = _sym_score(blink_left, blink_right)
        sym_overall = (
            sym_eyes * 0.25 + sym_brows * 0.18 + sym_nose * 0.22
            + sym_mouth * 0.22 + sym_blink * 0.13
        )
    else:
        sym_overall = (sym_eyes * 0.3 + sym_brows * 0.2 + sym_nose * 0.25 + sym_mouth * 0.25)

    symmetry = {
        "overall_score": round(sym_overall, 1),
        "eyes": round(sym_eyes, 1),
        "eyebrows": round(sym_brows, 1),
        "nose": round(sym_nose, 1),
        "mouth": round(sym_mouth, 1),
    }

    # --- Twelve Palaces (十二宫) ---
    right_brow_inner = _px(landmarks, 107, w, h)
    left_brow_inner = _px(landmarks, 336, w, h)
    inter_brow_dist = _dist(right_brow_inner, left_brow_inner)
    # 1. Destiny Palace (命宫/印堂): space between eyebrows
    yintang_ratio = inter_brow_dist / avg_eye_width if avg_eye_width > 0 else 1.0
    # 2. Property Palace (田宅宫): brow-eye gap (use average from eyebrow data)
    tianzhai_ratio = avg_gap
    # 3. Career Palace (官禄宫): forehead fullness = height * relative width
    guanlu_score = forehead_height_ratio * (forehead_width / cheekbone_width if cheekbone_width > 0 else 1.0)
    # 4. Wealth Palace (财帛宫): nose tip fullness
    nose_tip_pt = _px(landmarks, _NOSE_TIP, w, h)
    nose_left_wing = _px(landmarks, _NOSE_LEFT_WING, w, h)
    nose_right_wing = _px(landmarks, _NOSE_RIGHT_WING, w, h)
    nose_tip_width = _dist(nose_left_wing, nose_right_wing)
    caibu_ratio = nose_tip_width / cheekbone_width if cheekbone_width > 0 else 0.25
    # 5. Spouse Palace (夫妻宫): temple area (eye corner to face edge)
    right_temple = _px(landmarks, 162, w, h)
    left_temple = _px(landmarks, 389, w, h)
    right_temple_width = _dist(right_eye_outer, right_temple)
    left_temple_width = _dist(left_eye_outer, left_temple)
    fuqi_ratio = (right_temple_width + left_temple_width) / (2 * avg_eye_width) if avg_eye_width > 0 else 0.5
    # 6. Siblings Palace (兄弟宫): eyebrow quality = length + shape
    xiongdi_score = avg_len * (1.0 + avg_arch * 2)

    # 7. Migration Palace (迁移宫): temple depth relative to cheekbone width
    right_temple_depth = abs(right_temple[0] - right_eye_outer[0])
    left_temple_depth = abs(left_temple[0] - left_eye_outer[0])
    qianyi_ratio = (right_temple_depth + left_temple_depth) / (2 * cheekbone_width) if cheekbone_width > 0 else 0.15

    # 8. Health Palace (疾厄宫): nose bridge root height relative to face height
    nose_root = _px(landmarks, _NOSE_BRIDGE[0], w, h)  # landmark 6
    jie_e_ratio = (nose_root[1] - forehead_pt[1]) / face_height if face_height > 0 else 0.30

    # 9. Children Palace (子女宫): under-eye area fullness
    right_lower_ys = [landmarks[i].y * h for i in _RIGHT_LOWER_EYE]
    left_lower_ys = [landmarks[i].y * h for i in _LEFT_LOWER_EYE]
    right_lower_eye_height = max(right_lower_ys) - min(right_lower_ys) if right_lower_ys else 0.0
    left_lower_eye_height = max(left_lower_ys) - min(left_lower_ys) if left_lower_ys else 0.0
    avg_lower_eye = (right_lower_eye_height + left_lower_eye_height) / 2
    zinv_ratio = avg_lower_eye / face_height if face_height > 0 else 0.02

    # 10. Servants Palace (奴仆宫): lower jaw width relative to cheekbone width
    lower_jaw_width = _dist(
        _centroid(landmarks, _JAW_LEFT[:2], w, h),
        _centroid(landmarks, _JAW_RIGHT[:2], w, h),
    )
    nupu_ratio = lower_jaw_width / cheekbone_width if cheekbone_width > 0 else 0.6

    # 11. Parents Palace (父母宫): forehead-to-brow outer distance / face height
    right_brow_outer = _px(landmarks, _RIGHT_BROW_OUTER, w, h)
    left_brow_outer = _px(landmarks, _LEFT_BROW_OUTER, w, h)
    right_parent_height = abs(forehead_pt[1] - right_brow_outer[1])
    left_parent_height = abs(forehead_pt[1] - left_brow_outer[1])
    fumu_ratio = (right_parent_height + left_parent_height) / (2 * face_height) if face_height > 0 else 0.15

    # 12. Fortune Palace (福德宫): forehead edge to temple distance / cheekbone width
    forehead_left_pt = _px(landmarks, _FOREHEAD_LEFT, w, h)
    forehead_right_pt = _px(landmarks, _FOREHEAD_RIGHT, w, h)
    right_fude_width = _dist(forehead_right_pt, right_temple)
    left_fude_width = _dist(forehead_left_pt, left_temple)
    fude_ratio = (right_fude_width + left_fude_width) / (2 * cheekbone_width) if cheekbone_width > 0 else 0.12

    twelve_palaces = {
        "yintang":  {"label": "命宫", "ratio": round(yintang_ratio, 3), "ideal": 1.0},
        "tianzhai": {"label": "田宅宫", "ratio": round(tianzhai_ratio, 4), "ideal": 0.05},
        "guanlu":   {"label": "官禄宫", "score": round(guanlu_score, 3)},
        "caibu":    {"label": "财帛宫", "ratio": round(caibu_ratio, 3), "ideal": 0.25},
        "fuqi":     {"label": "夫妻宫", "ratio": round(fuqi_ratio, 3), "ideal": 0.50},
        "xiongdi":  {"label": "兄弟宫", "score": round(xiongdi_score, 3)},
        "qianyi":   {"label": "迁移宫", "ratio": round(qianyi_ratio, 3), "ideal": 0.15},
        "jie_e":    {"label": "疾厄宫", "ratio": round(jie_e_ratio, 3), "ideal": 0.30},
        "zinv":     {"label": "子女宫", "ratio": round(zinv_ratio, 4), "ideal": 0.025},
        "nupu":     {"label": "奴仆宫", "ratio": round(nupu_ratio, 3), "ideal": 0.70},
        "fumu":     {"label": "父母宫", "ratio": round(fumu_ratio, 3), "ideal": 0.15},
        "fude":     {"label": "福德宫", "ratio": round(fude_ratio, 3), "ideal": 0.12},
    }

    # --- Five Mountains (五岳) ---
    face_center_x = (forehead_pt[0] + chin_pt[0]) / 2
    left_cheek_pt = _px(landmarks, _LEFT_CHEEK, w, h)
    right_cheek_pt = _px(landmarks, _RIGHT_CHEEK, w, h)
    # South Mountain (南岳 = forehead): prominence = height ratio
    south_prominence = forehead_height_ratio
    # North Mountain (北岳 = chin): prominence = lower court ratio
    north_prominence = three_courts["lower"]
    # Center Mountain (中岳 = nose): prominence = nose length ratio
    center_prominence = nose_length / face_height
    # East Mountain (东岳 = right cheekbone): distance from center to cheekbone
    east_prominence = abs(right_cheek_pt[0] - face_center_x) / face_height
    # West Mountain (西岳 = left cheekbone): distance from center to cheekbone
    west_prominence = abs(left_cheek_pt[0] - face_center_x) / face_height
    # Balance: how evenly distributed the five mountains are
    mountain_values = [south_prominence, north_prominence, center_prominence, east_prominence, west_prominence]
    mountain_avg = sum(mountain_values) / len(mountain_values) if mountain_values else 0.3
    mountain_variance = sum((v - mountain_avg) ** 2 for v in mountain_values) / len(mountain_values)
    mountain_balance = max(0.0, 1.0 - mountain_variance * 20)

    five_mountains = {
        "south": {"label": "南岳(额)", "prominence": round(south_prominence, 3)},
        "north": {"label": "北岳(颏)", "prominence": round(north_prominence, 3)},
        "center": {"label": "中岳(鼻)", "prominence": round(center_prominence, 3)},
        "east": {"label": "东岳(右颧)", "prominence": round(east_prominence, 3)},
        "west": {"label": "西岳(左颧)", "prominence": round(west_prominence, 3)},
        "balance": round(mountain_balance, 3),
    }

    # --- Visualization landmarks (normalized 0-1 coordinates) ---
    right_iris = _px(landmarks, _RIGHT_IRIS_CENTER, w, h)
    left_iris = _px(landmarks, _LEFT_IRIS_CENTER, w, h)
    mouth_center = _midpoint(mouth_left, mouth_right)

    visualization = {
        "three_courts": {
            "y_hairline": round(forehead_pt[1] / h, 4),
            "y_brow": round(brow_mid[1] / h, 4),
            "y_nose_base": round(nose_tip_pt[1] / h, 4),
            "y_chin": round(chin_pt[1] / h, 4),
        },
        "five_eyes": {
            "y": round((right_iris[1] + left_iris[1]) / (2 * h), 4),
            "x_points": [
                round(right_cheek_pt[0] / w, 4),
                round(right_eye_outer[0] / w, 4),
                round(right_eye_inner[0] / w, 4),
                round(left_eye_inner[0] / w, 4),
                round(left_eye_outer[0] / w, 4),
                round(left_cheek_pt[0] / w, 4),
            ],
        },
        "center_x": round(face_center_x / w, 4),
        "face_contour": [
            [round(landmarks[i].x, 4), round(landmarks[i].y, 4)]
            for i in _FACE_OVAL
        ],
        "key_points": {
            "left_eye": [round(left_iris[0] / w, 4), round(left_iris[1] / h, 4)],
            "right_eye": [round(right_iris[0] / w, 4), round(right_iris[1] / h, 4)],
            "nose_tip": [round(nose_tip_pt[0] / w, 4), round(nose_tip_pt[1] / h, 4)],
            "mouth_center": [round(mouth_center[0] / w, 4), round(mouth_center[1] / h, 4)],
            "left_brow": [round(left_brow_center[0] / w, 4), round(left_brow_center[1] / h, 4)],
            "right_brow": [round(right_brow_center[0] / w, 4), round(right_brow_center[1] / h, 4)],
            "chin": [round(chin_pt[0] / w, 4), round(chin_pt[1] / h, 4)],
        },
        # Extended contour data for overlay rendering
        "eyebrow_contours": {
            "left": [[round(landmarks[i].x, 4), round(landmarks[i].y, 4)] for i in _LEFT_EYEBROW],
            "right": [[round(landmarks[i].x, 4), round(landmarks[i].y, 4)] for i in _RIGHT_EYEBROW],
        },
        "nose_contour": [
            [round(landmarks[i].x, 4), round(landmarks[i].y, 4)] for i in _NOSE_BRIDGE
        ] + [
            [round(landmarks[_NOSE_LEFT_WING].x, 4), round(landmarks[_NOSE_LEFT_WING].y, 4)],
            [round(landmarks[_NOSE_TIP].x, 4), round(landmarks[_NOSE_TIP].y, 4)],
            [round(landmarks[_NOSE_RIGHT_WING].x, 4), round(landmarks[_NOSE_RIGHT_WING].y, 4)],
        ],
        "mouth_contour": [
            [round(landmarks[_MOUTH_LEFT_CORNER].x, 4), round(landmarks[_MOUTH_LEFT_CORNER].y, 4)],
            [round(landmarks[_UPPER_LIP_TOP].x, 4), round(landmarks[_UPPER_LIP_TOP].y, 4)],
            [round(landmarks[_MOUTH_RIGHT_CORNER].x, 4), round(landmarks[_MOUTH_RIGHT_CORNER].y, 4)],
            [round(landmarks[_LOWER_LIP_BOTTOM].x, 4), round(landmarks[_LOWER_LIP_BOTTOM].y, 4)],
        ],
        "jaw_contour": [
            [round(landmarks[i].x, 4), round(landmarks[i].y, 4)]
            for i in _JAW_LEFT + [_JAW_CENTER] + list(reversed(_JAW_RIGHT))
        ],
        "forehead": {
            "top": [round(landmarks[_FOREHEAD_TOP].x, 4), round(landmarks[_FOREHEAD_TOP].y, 4)],
            "left": [round(landmarks[_FOREHEAD_LEFT].x, 4), round(landmarks[_FOREHEAD_LEFT].y, 4)],
            "right": [round(landmarks[_FOREHEAD_RIGHT].x, 4), round(landmarks[_FOREHEAD_RIGHT].y, 4)],
        },
        "cheekbones": {
            "left": [round(landmarks[_LEFT_CHEEK].x, 4), round(landmarks[_LEFT_CHEEK].y, 4)],
            "right": [round(landmarks[_RIGHT_CHEEK].x, 4), round(landmarks[_RIGHT_CHEEK].y, 4)],
        },
        "ipd_pixels": round(_dist(right_iris, left_iris), 1),
    }

    # --- Raw ratios (flat dict for LLM prompt context) ---
    raw_ratios = {
        "face_width_height_ratio": round(wh_ratio, 3),
        "three_courts_upper": three_courts["upper"],
        "three_courts_middle": three_courts["middle"],
        "three_courts_lower": three_courts["lower"],
        "five_eyes_ratio": five_eyes["ratio"],
        "eye_corner_angle_avg": round(avg_eye_angle, 2),
        "eye_width_height_ratio_avg": round(avg_eye_whr, 2),
        "inter_eye_distance_ratio": eyes["inter_eye_distance"],
        "nose_length_ratio": nose["length_ratio"],
        "nose_width_ratio": nose["width_ratio"],
        "nose_bridge_straightness": nose["bridge_straightness"],
        "mouth_width_ratio": mouth["width_ratio"],
        "lip_thickness_ratio": mouth["lip_ratio"],
        "mouth_corner_angle": mouth["corner_angle"],
        "eyebrow_arch_ratio": round(avg_arch, 3),
        "eyebrow_length_ratio": round(avg_len, 2),
        "forehead_height_ratio": forehead["height_ratio"],
        "jaw_width_ratio": jawline["width_ratio"],
        "jaw_angle_sharpness": jawline["angle_sharpness"],
        "symmetry_score": symmetry["overall_score"],
        "ipd_pixels": round(_dist(right_iris, left_iris), 1),
    }

    # Append expression data from blendshapes
    if blendshapes:
        raw_ratios["blink_asymmetry"] = round(abs(blink_left - blink_right), 3)
        raw_ratios["smile_score"] = round((smile_left + smile_right) / 2.0, 3)

    return {
        "three_courts": three_courts,
        "five_eyes": five_eyes,
        "face_shape": face_shape,
        "eyes": eyes,
        "nose": nose,
        "mouth": mouth,
        "eyebrows": eyebrows,
        "forehead": forehead,
        "jawline": jawline,
        "symmetry": symmetry,
        "twelve_palaces": twelve_palaces,
        "five_mountains": five_mountains,
        "visualization": visualization,
        "raw_ratios": raw_ratios,
    }
