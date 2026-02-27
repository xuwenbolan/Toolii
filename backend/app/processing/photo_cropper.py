from __future__ import annotations

import io
import math
from typing import Any

import numpy as np
from PIL import Image, ImageColor

from app.processing.image_io import open_image


def _mm_to_px(mm: float, dpi: int) -> int:
    return max(1, int(round(mm * dpi / 25.4)))


def _parse_color(color: str) -> tuple[int, int, int]:
    try:
        value = ImageColor.getrgb(color)
    except Exception:  # noqa: BLE001
        return (255, 255, 255)
    if len(value) == 4:
        return (value[0], value[1], value[2])
    return value  # type: ignore[return-value]


def _as_dict(value: object) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    return {}


def _point(mapping: dict[str, Any], key: str) -> tuple[float, float] | None:
    value = mapping.get(key)
    if not isinstance(value, (list, tuple)) or len(value) < 2:
        return None
    try:
        return float(value[0]), float(value[1])
    except Exception:  # noqa: BLE001
        return None


def _alpha_subject_box(subject: Image.Image) -> dict[str, int] | None:
    rgba = subject.convert("RGBA")
    alpha = np.array(rgba.getchannel("A"), dtype=np.uint8)
    total = max(1, alpha.shape[0] * alpha.shape[1])
    transparent_ratio = float((alpha < 5).sum() / total)
    if transparent_ratio < 0.002:
        return None

    mask = alpha > 20
    if not mask.any():
        return None
    ys, xs = np.where(mask)
    x0 = int(xs.min())
    y0 = int(ys.min())
    x1 = int(xs.max())
    y1 = int(ys.max())
    return {"x": x0, "y": y0, "w": int(x1 - x0 + 1), "h": int(y1 - y0 + 1)}


def _estimate_head_geometry(
    *,
    face: dict[str, Any] | None,
    subject_box: dict[str, int] | None,
    img_w: int,
    img_h: int,
) -> dict[str, float]:
    if not face:
        if subject_box:
            sx = float(subject_box["x"])
            sy = float(subject_box["y"])
            sw = float(subject_box["w"])
            sh = float(subject_box["h"])
            return {
                "center_x": sx + sw / 2,
                "head_top_y": sy,
                "chin_y": sy + sh * 0.72,
            }
        return {
            "center_x": img_w / 2,
            "head_top_y": img_h * 0.16,
            "chin_y": img_h * 0.62,
        }

    fx = float(face.get("x", img_w * 0.3))
    fy = float(face.get("y", img_h * 0.2))
    fw = float(face.get("w", img_w * 0.4))
    fh = float(face.get("h", img_h * 0.5))

    landmarks = _as_dict(face.get("landmarks"))
    left_eye = _point(landmarks, "left_eye")
    right_eye = _point(landmarks, "right_eye")
    chin = _point(landmarks, "chin")
    head_top_guess = _point(landmarks, "head_top_guess")

    if left_eye and right_eye:
        center_x = (left_eye[0] + right_eye[0]) / 2
    else:
        center_x = fx + fw / 2

    head_top_y = head_top_guess[1] if head_top_guess else fy - fh * 0.18
    chin_y = chin[1] if chin else fy + fh * 1.02

    if subject_box:
        sx = float(subject_box["x"])
        sy = float(subject_box["y"])
        sw = float(subject_box["w"])
        sh = float(subject_box["h"])
        subject_center_x = sx + sw / 2
        center_x = center_x * 0.75 + subject_center_x * 0.25
        head_top_y = min(head_top_y, sy)
        chin_y = max(chin_y, min(sy + sh, fy + fh * 1.08))

    head_top_y = max(-img_h * 0.4, min(head_top_y, img_h - 2))
    chin_y = max(head_top_y + 1, min(chin_y, img_h + img_h * 0.2))
    center_x = max(-img_w * 0.2, min(center_x, img_w + img_w * 0.2))
    return {
        "center_x": float(center_x),
        "head_top_y": float(head_top_y),
        "chin_y": float(chin_y),
    }


def _expand_crop(
    *,
    img_w: int,
    img_h: int,
    face: dict[str, Any] | None,
    subject_box: dict[str, int] | None,
    target_w: int,
    target_h: int,
    face_height_ratio: float,
    top_margin_ratio: float,
) -> tuple[int, int, int, int]:
    if not face:
        crop_w = img_w
        crop_h = int(round(crop_w * (target_h / target_w)))
        if crop_h > img_h:
            crop_h = img_h
            crop_w = int(round(crop_h * (target_w / target_h)))
        x = max(0, (img_w - crop_w) // 2)
        y = max(0, (img_h - crop_h) // 2)
        return x, y, crop_w, crop_h

    fw = float(face["w"])
    fh = float(face["h"])

    head = _estimate_head_geometry(
        face=face,
        subject_box=subject_box,
        img_w=img_w,
        img_h=img_h,
    )
    center_x = float(head["center_x"])
    head_top_y = float(head["head_top_y"])
    chin_y = float(head["chin_y"])
    head_height = max(1.0, chin_y - head_top_y)

    safe_face_height_ratio = max(0.45, min(0.85, face_height_ratio))
    safe_top_margin_ratio = max(0.03, min(0.3, top_margin_ratio))

    desired_crop_h = max(head_height / safe_face_height_ratio, fh * 1.08)
    desired_crop_w = desired_crop_h * (target_w / target_h)

    desired_crop_w = max(desired_crop_w, fw * 1.28)
    if subject_box:
        desired_crop_w = max(desired_crop_w, float(subject_box["w"]) * 1.03)

    desired_y = head_top_y - desired_crop_h * safe_top_margin_ratio
    desired_x = center_x - desired_crop_w / 2

    x = math.floor(desired_x)
    y = math.floor(desired_y)
    w = math.ceil(desired_crop_w)
    h = math.ceil(desired_crop_h)

    # Keep estimated head region inside the crop with small safety margins.
    top_safe = head_top_y - h * 0.01
    bottom_safe = chin_y + h * 0.02
    if top_safe < y:
        y = math.floor(top_safe)
    if bottom_safe > y + h:
        y = math.ceil(bottom_safe - h)

    if subject_box:
        sx = float(subject_box["x"])
        sy = float(subject_box["y"])
        sw = float(subject_box["w"])
        sh = float(subject_box["h"])
        left_safe = sx - w * 0.01
        right_safe = sx + sw + w * 0.01
        if left_safe < x:
            x = math.floor(left_safe)
        if right_safe > x + w:
            x = math.ceil(right_safe - w)
        if sy < y + h * 0.01:
            y = math.floor(sy - h * 0.01)
        subject_bottom = sy + sh
        if subject_bottom > y + h + h * 0.04:
            y = math.ceil(subject_bottom - h * 1.04)

    return x, y, max(1, w), max(1, h)


def _crop_with_padding(image: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    x, y, w, h = box
    src_w, src_h = image.size

    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    left = max(0, x)
    top = max(0, y)
    right = min(src_w, x + w)
    bottom = min(src_h, y + h)

    if right > left and bottom > top:
        patch = image.crop((left, top, right, bottom)).convert("RGBA")
        canvas.paste(patch, (left - x, top - y))
    return canvas


def crop_id_photo(
    image_bytes: bytes,
    *,
    standard: dict[str, Any],
    face: dict[str, Any] | None = None,
    cutout_png_bytes: bytes | None = None,
    background_color: str = "#FFFFFF",
) -> tuple[bytes, dict[str, Any]]:
    source = open_image(image_bytes).convert("RGBA")
    subject = open_image(cutout_png_bytes).convert("RGBA") if cutout_png_bytes else source.copy()
    subject_box = _alpha_subject_box(subject)

    dpi = int(standard.get("dpi", 300))
    target_w = _mm_to_px(float(standard["width_mm"]), dpi)
    target_h = _mm_to_px(float(standard["height_mm"]), dpi)
    face_height_ratio = float(standard.get("face_height_ratio", 0.68))
    top_margin_ratio = float(standard.get("top_margin_ratio", 0.12))

    crop_box = _expand_crop(
        img_w=source.width,
        img_h=source.height,
        face=face,
        subject_box=subject_box,
        target_w=target_w,
        target_h=target_h,
        face_height_ratio=face_height_ratio,
        top_margin_ratio=top_margin_ratio,
    )

    cropped_subject = _crop_with_padding(subject, crop_box)
    resized_subject = cropped_subject.resize((target_w, target_h), Image.Resampling.LANCZOS)

    bg_rgb = _parse_color(background_color)
    final = Image.new("RGBA", (target_w, target_h), (*bg_rgb, 255))
    final.alpha_composite(resized_subject)

    out = io.BytesIO()
    final.save(out, format="PNG", optimize=True, dpi=(dpi, dpi))

    x, y, w, h = crop_box
    head_est = _estimate_head_geometry(
        face=face,
        subject_box=subject_box,
        img_w=source.width,
        img_h=source.height,
    )
    head_height_est = max(1.0, float(head_est["chin_y"]) - float(head_est["head_top_y"]))
    meta = {
        "crop_box": {"x": x, "y": y, "w": w, "h": h},
        "subject_box": subject_box,
        "head_estimate": {
            "center_x": round(float(head_est["center_x"]), 2),
            "head_top_y": round(float(head_est["head_top_y"]), 2),
            "chin_y": round(float(head_est["chin_y"]), 2),
            "head_height_px": round(head_height_est, 2),
            "head_height_ratio_source": round(head_height_est / max(1, source.height), 4),
        },
        "output_width": target_w,
        "output_height": target_h,
        "dpi": dpi,
    }
    return out.getvalue(), meta
