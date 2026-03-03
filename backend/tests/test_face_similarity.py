"""Tests for face similarity comparison pipeline."""

from pathlib import Path

import pytest

from app.processing.face_detection import detect_face_landmarks, LANDMARKER_UNAVAILABLE, _decode_image
from app.processing.face_similarity import (
    compare_faces,
    prewarm_facenet,
    _extract_embedding,
    _crop_region,
    _similarity_to_percent,
    _REGIONS,
)

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "test"
FACES_DIR = DATA_DIR / "faces"

# Same-person images
XWB1 = DATA_DIR / "xwb.jpg"
XWB2 = DATA_DIR / "xwb2.jpg"

# Different people
MAN1 = FACES_DIR / "man_01.jpg"
WOMAN1 = FACES_DIR / "woman_01.jpg"


def _load(path: Path) -> bytes:
    return path.read_bytes()


def _detect(image_bytes: bytes):
    result = detect_face_landmarks(image_bytes)
    assert result != LANDMARKER_UNAVAILABLE, "MediaPipe model not available"
    assert result is not None, "No face detected"
    return result


@pytest.fixture(scope="module", autouse=True)
def _warmup():
    assert prewarm_facenet(), "Facenet512 ONNX model not available"


class TestEmbeddingExtraction:
    def test_produces_512d_vector(self):
        img_bytes = _load(MAN1)
        img = _decode_image(img_bytes)
        lm, _, w, h, _ = _detect(img_bytes)

        # Crop eyes region
        crop = _crop_region(img, lm, _REGIONS["eyes"], w, h)
        emb = _extract_embedding(crop)
        assert emb is not None
        assert emb.shape == (512,)
        # L2 normalized: norm should be ~1.0
        import numpy as np
        assert abs(np.linalg.norm(emb) - 1.0) < 1e-5

    def test_different_regions_give_different_embeddings(self):
        img_bytes = _load(MAN1)
        img = _decode_image(img_bytes)
        lm, _, w, h, _ = _detect(img_bytes)

        import numpy as np
        emb_eyes = _extract_embedding(_crop_region(img, lm, _REGIONS["eyes"], w, h))
        emb_nose = _extract_embedding(_crop_region(img, lm, _REGIONS["nose"], w, h))
        assert emb_eyes is not None and emb_nose is not None

        # Different regions should produce different embeddings
        sim = float(np.dot(emb_eyes, emb_nose))
        assert sim < 0.95, f"Eyes and nose embeddings too similar: {sim}"


class TestSimilarityScoring:
    def test_percent_mapping(self):
        assert _similarity_to_percent(0.0) == 15  # floor
        assert _similarity_to_percent(1.0) == 98  # ceiling
        assert _similarity_to_percent(0.5) >= 60
        assert _similarity_to_percent(0.5) <= 70
        # Monotonic
        prev = 0
        for s in [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]:
            p = _similarity_to_percent(s)
            assert p >= prev, f"Not monotonic at {s}: {p} < {prev}"
            prev = p


class TestFaceComparison:
    def test_same_person_higher_score(self):
        """Same-person images should score higher than different people."""
        b1 = _load(XWB1)
        b2 = _load(XWB2)
        lm1, _, w1, h1, _ = _detect(b1)
        lm2, _, w2, h2, _ = _detect(b2)
        img1 = _decode_image(b1)
        img2 = _decode_image(b2)

        same_result = compare_faces(img1, img2, lm1, lm2, w1, h1, w2, h2)
        same_score = same_result["overall_score"]

        # Different people
        b3 = _load(WOMAN1)
        lm3, _, w3, h3, _ = _detect(b3)
        img3 = _decode_image(b3)

        diff_result = compare_faces(img1, img3, lm1, lm3, w1, h1, w3, h3)
        diff_score = diff_result["overall_score"]

        print(f"Same person score: {same_score}")
        print(f"Different people score: {diff_score}")

        assert same_score > diff_score, (
            f"Same person should score higher: same={same_score}, diff={diff_score}"
        )

    def test_all_regions_present(self):
        b1 = _load(MAN1)
        b2 = _load(WOMAN1)
        lm1, _, w1, h1, _ = _detect(b1)
        lm2, _, w2, h2, _ = _detect(b2)
        img1 = _decode_image(b1)
        img2 = _decode_image(b2)

        result = compare_faces(img1, img2, lm1, lm2, w1, h1, w2, h2)

        expected_regions = {"eyes", "nose", "mouth", "jawline", "overall_face"}
        actual_regions = set(result["regions"].keys())
        assert actual_regions == expected_regions, f"Missing regions: {expected_regions - actual_regions}"

        for name, data in result["regions"].items():
            assert 0 <= data["score"] <= 100, f"{name} score out of range: {data['score']}"

    def test_overall_score_present(self):
        b1 = _load(MAN1)
        b2 = _load(WOMAN1)
        lm1, _, w1, h1, _ = _detect(b1)
        lm2, _, w2, h2, _ = _detect(b2)
        img1 = _decode_image(b1)
        img2 = _decode_image(b2)

        result = compare_faces(img1, img2, lm1, lm2, w1, h1, w2, h2)
        assert 0 <= result["overall_score"] <= 100

    def test_geometric_ratios_present(self):
        b1 = _load(MAN1)
        b2 = _load(WOMAN1)
        lm1, _, w1, h1, _ = _detect(b1)
        lm2, _, w2, h2, _ = _detect(b2)
        img1 = _decode_image(b1)
        img2 = _decode_image(b2)

        result = compare_faces(img1, img2, lm1, lm2, w1, h1, w2, h2)
        assert "ratios1" in result
        assert "ratios2" in result
        for key in ["eye_distance_ratio", "nose_length_ratio", "mouth_width_ratio"]:
            assert key in result["ratios1"], f"Missing ratio: {key}"
