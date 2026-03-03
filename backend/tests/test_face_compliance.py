"""Tests for face compliance checks."""

from __future__ import annotations

import cv2
import numpy as np
import pytest

from app.core.exceptions import AppError
from app.processing.face_compliance import validate_face_compliance


# ---------------------------------------------------------------------------
# Mock helpers
# ---------------------------------------------------------------------------

class MockLandmark:
    """Minimal mock for MediaPipe NormalizedLandmark."""

    def __init__(self, x: float, y: float, z: float = 0.0):
        self.x = x
        self.y = y
        self.z = z
        self.visibility = 1.0
        self.presence = 1.0


class MockBlendshape:
    """Minimal mock for MediaPipe Category (blendshape)."""

    def __init__(self, category_name: str, score: float, index: int = 0):
        self.category_name = category_name
        self.score = score
        self.index = index


# Face oval landmark indices (must match face_compliance._FACE_OVAL)
_FACE_OVAL = [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
    397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
    172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
]

W, H = 1000, 1000


def _make_frontal_landmarks() -> list[MockLandmark]:
    """Build 478 MockLandmarks forming a centered, large, frontal face."""
    lms = [MockLandmark(0.5, 0.5)] * 478

    # Iris centers: IPD = 200px (0.2 * 1000) at same height
    lms[468] = MockLandmark(0.40, 0.45)  # left iris
    lms[473] = MockLandmark(0.60, 0.45)  # right iris

    # Nose tip centered between irises
    lms[1] = MockLandmark(0.50, 0.55)

    # Face oval: spread to cover ~30% of image area
    for idx in _FACE_OVAL:
        # Distribute oval points in a box from (0.25,0.20) to (0.75,0.80)
        frac = _FACE_OVAL.index(idx) / max(len(_FACE_OVAL) - 1, 1)
        lms[idx] = MockLandmark(0.25 + frac * 0.50, 0.20 + frac * 0.60)

    return lms


def _neutral_blendshapes() -> list[MockBlendshape]:
    """Return blendshapes for a neutral, resting face."""
    return [
        MockBlendshape("eyeBlinkLeft", 0.05),
        MockBlendshape("eyeBlinkRight", 0.05),
        MockBlendshape("mouthSmileLeft", 0.02),
        MockBlendshape("mouthSmileRight", 0.02),
        MockBlendshape("jawOpen", 0.01),
        MockBlendshape("mouthFrownLeft", 0.0),
        MockBlendshape("mouthFrownRight", 0.0),
        MockBlendshape("browDownLeft", 0.0),
        MockBlendshape("browDownRight", 0.0),
        MockBlendshape("cheekPuff", 0.0),
        MockBlendshape("mouthFunnel", 0.0),
        MockBlendshape("mouthPucker", 0.0),
    ]


def _make_sharp_image_bytes() -> bytes:
    """Generate a sharp (high-contrast) 500x500 JPEG for blur tests."""
    img = np.zeros((500, 500), dtype=np.uint8)
    for r in range(0, 500, 10):
        for c in range(0, 500, 10):
            if (r // 10 + c // 10) % 2 == 0:
                img[r:r + 10, c:c + 10] = 255
    _, buf = cv2.imencode(".jpg", img)
    return buf.tobytes()


def _make_blurry_image_bytes() -> bytes:
    """Generate a solid gray 500x500 JPEG (zero Laplacian variance)."""
    img = np.full((500, 500), 128, dtype=np.uint8)
    _, buf = cv2.imencode(".jpg", img)
    return buf.tobytes()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestValidFrontalFace:
    def test_passes_all_checks(self):
        validate_face_compliance(
            landmarks=_make_frontal_landmarks(),
            blendshapes=_neutral_blendshapes(),
            width=W,
            height=H,
            face_count=1,
            image_bytes=_make_sharp_image_bytes(),
        )

    def test_passes_without_image_bytes(self):
        validate_face_compliance(
            landmarks=_make_frontal_landmarks(),
            blendshapes=_neutral_blendshapes(),
            width=W,
            height=H,
            face_count=1,
        )


class TestMultiFace:
    def test_rejects_multiple_faces(self):
        with pytest.raises(AppError, match="Multiple faces") as exc_info:
            validate_face_compliance(
                landmarks=_make_frontal_landmarks(),
                blendshapes=_neutral_blendshapes(),
                width=W,
                height=H,
                face_count=3,
            )
        assert exc_info.value.code == "FACE_MULTI_DETECTED"

    def test_multi_face_checked_first(self):
        """Multi-face should be checked before face-size (which would also fail)."""
        lms = _make_frontal_landmarks()
        # Make face tiny (would fail size check)
        for idx in _FACE_OVAL:
            lms[idx] = MockLandmark(0.49, 0.49)
        with pytest.raises(AppError) as exc_info:
            validate_face_compliance(
                landmarks=lms,
                blendshapes=_neutral_blendshapes(),
                width=W,
                height=H,
                face_count=2,
            )
        assert exc_info.value.code == "FACE_MULTI_DETECTED"


class TestFaceSize:
    def test_rejects_small_face(self):
        lms = _make_frontal_landmarks()
        # Shrink face oval to cover < 5% area
        for idx in _FACE_OVAL:
            lms[idx] = MockLandmark(0.49, 0.49 + 0.001 * _FACE_OVAL.index(idx) / len(_FACE_OVAL))
        with pytest.raises(AppError) as exc_info:
            validate_face_compliance(
                landmarks=lms,
                blendshapes=_neutral_blendshapes(),
                width=W,
                height=H,
                face_count=1,
            )
        assert exc_info.value.code == "FACE_TOO_SMALL"


class TestEyeTilt:
    def test_rejects_excessive_tilt(self):
        lms = _make_frontal_landmarks()
        # Tilt irises ~30 degrees
        lms[468] = MockLandmark(0.40, 0.40)
        lms[473] = MockLandmark(0.60, 0.40 + 0.20 * 0.577)  # tan(30deg) ~ 0.577
        with pytest.raises(AppError) as exc_info:
            validate_face_compliance(
                landmarks=lms,
                blendshapes=_neutral_blendshapes(),
                width=W,
                height=H,
                face_count=1,
            )
        assert exc_info.value.code == "FACE_TILTED"


class TestIPD:
    def test_rejects_low_ipd(self):
        lms = _make_frontal_landmarks()
        # Place irises very close (IPD = 20px on 1000px image)
        lms[468] = MockLandmark(0.49, 0.45)
        lms[473] = MockLandmark(0.51, 0.45)
        with pytest.raises(AppError) as exc_info:
            validate_face_compliance(
                landmarks=lms,
                blendshapes=_neutral_blendshapes(),
                width=W,
                height=H,
                face_count=1,
            )
        assert exc_info.value.code == "FACE_LOW_RESOLUTION"


class TestYaw:
    def test_rejects_side_pose(self):
        lms = _make_frontal_landmarks()
        # Nose tip shifted far right of eye midpoint
        # IPD = 200px, offset = 0.12 * 1000 = 120px, ratio = 120/200 = 0.6
        lms[1] = MockLandmark(0.62, 0.55)
        with pytest.raises(AppError) as exc_info:
            validate_face_compliance(
                landmarks=lms,
                blendshapes=_neutral_blendshapes(),
                width=W,
                height=H,
                face_count=1,
            )
        assert exc_info.value.code == "FACE_SIDE_POSE"

    def test_slight_yaw_passes(self):
        lms = _make_frontal_landmarks()
        # Small offset: 0.02 * 1000 = 20px, ratio = 20/200 = 0.10
        lms[1] = MockLandmark(0.52, 0.55)
        validate_face_compliance(
            landmarks=lms,
            blendshapes=_neutral_blendshapes(),
            width=W,
            height=H,
            face_count=1,
        )


class TestEyeClosure:
    def test_rejects_closed_eyes(self):
        bs = _neutral_blendshapes()
        # Override blink scores
        for b in bs:
            if b.category_name == "eyeBlinkLeft":
                b.score = 0.80
            if b.category_name == "eyeBlinkRight":
                b.score = 0.80
        with pytest.raises(AppError) as exc_info:
            validate_face_compliance(
                landmarks=_make_frontal_landmarks(),
                blendshapes=bs,
                width=W,
                height=H,
                face_count=1,
            )
        assert exc_info.value.code == "FACE_EYES_CLOSED"

    def test_natural_squint_passes(self):
        bs = _neutral_blendshapes()
        for b in bs:
            if "eyeBlink" in b.category_name:
                b.score = 0.30
        validate_face_compliance(
            landmarks=_make_frontal_landmarks(),
            blendshapes=bs,
            width=W,
            height=H,
            face_count=1,
        )


class TestExtremeExpression:
    def test_rejects_extreme_expression(self):
        bs = _neutral_blendshapes()
        for b in bs:
            if b.category_name == "jawOpen":
                b.score = 0.95
            if b.category_name in ("mouthSmileLeft", "mouthSmileRight"):
                b.score = 0.90
            if b.category_name == "cheekPuff":
                b.score = 0.80
        with pytest.raises(AppError) as exc_info:
            validate_face_compliance(
                landmarks=_make_frontal_landmarks(),
                blendshapes=bs,
                width=W,
                height=H,
                face_count=1,
            )
        assert exc_info.value.code == "FACE_EXTREME_EXPRESSION"

    def test_mild_smile_passes(self):
        bs = _neutral_blendshapes()
        for b in bs:
            if "Smile" in b.category_name:
                b.score = 0.30
        validate_face_compliance(
            landmarks=_make_frontal_landmarks(),
            blendshapes=bs,
            width=W,
            height=H,
            face_count=1,
        )


class TestBlur:
    def test_rejects_blurry_image(self):
        lms = _make_frontal_landmarks()
        # Shrink landmark bbox so ROI falls within the 200x200 image
        for lm in lms:
            lm.x = lm.x * 0.8 + 0.1
            lm.y = lm.y * 0.8 + 0.1
        with pytest.raises(AppError) as exc_info:
            validate_face_compliance(
                landmarks=lms,
                blendshapes=_neutral_blendshapes(),
                width=500,
                height=500,
                face_count=1,
                image_bytes=_make_blurry_image_bytes(),
            )
        assert exc_info.value.code == "FACE_BLURRY"

    def test_sharp_image_passes(self):
        lms = _make_frontal_landmarks()
        for lm in lms:
            lm.x = lm.x * 0.8 + 0.1
            lm.y = lm.y * 0.8 + 0.1
        validate_face_compliance(
            landmarks=lms,
            blendshapes=_neutral_blendshapes(),
            width=500,
            height=500,
            face_count=1,
            image_bytes=_make_sharp_image_bytes(),
        )

    def test_blur_skipped_when_no_image(self):
        """Blur check should be skipped gracefully when image_bytes is None."""
        validate_face_compliance(
            landmarks=_make_frontal_landmarks(),
            blendshapes=_neutral_blendshapes(),
            width=W,
            height=H,
            face_count=1,
            image_bytes=None,
        )
