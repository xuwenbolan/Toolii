from __future__ import annotations

import io

from PIL import Image

from app.processing.compliance_checker import check_photo_compliance


def _solid_image(width: int = 800, height: int = 1000, color: tuple[int, int, int] = (240, 240, 240)) -> bytes:
    image = Image.new("RGB", (width, height), color)
    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


def test_compliance_checker_returns_13_checks_when_no_face() -> None:
    result = check_photo_compliance(_solid_image())
    assert isinstance(result["passed"], bool)
    assert isinstance(result["score"], int)
    assert len(result["checks"]) == 13
    check_ids = {item["id"] for item in result["checks"]}
    assert "face_detected" in check_ids
    assert "background" in check_ids


def test_compliance_checker_accepts_face_payload_and_cutout() -> None:
    image_bytes = _solid_image()
    cutout_img = Image.new("RGBA", (800, 1000), (0, 0, 0, 0))
    for x in range(250, 550):
        for y in range(120, 900):
            cutout_img.putpixel((x, y), (200, 180, 160, 255))
    out = io.BytesIO()
    cutout_img.save(out, format="PNG")

    result = check_photo_compliance(
        image_bytes,
        faces=[
            {
                "x": 260,
                "y": 140,
                "w": 280,
                "h": 360,
                "landmarks": {
                    "left_eye": [340, 260],
                    "right_eye": [460, 260],
                    "mouth": [400, 390],
                    "chin": [400, 510],
                    "head_top_guess": [400, 120],
                    "eyes_detected": 2,
                    "eye_angle_deg": 0.0,
                    "eye_distance": 120.0,
                },
                "features": {
                    "eyes": [{"x": 320, "y": 245, "w": 40, "h": 10}, {"x": 440, "y": 245, "w": 40, "h": 10}],
                    "smiles": [],
                },
            }
        ],
        cutout_png_bytes=out.getvalue(),
        detection_engine="opencv-haar-frontal",
    )

    assert len(result["checks"]) == 13
    background_check = next(item for item in result["checks"] if item["id"] == "background")
    assert "抠图质量" in background_check["message"]
