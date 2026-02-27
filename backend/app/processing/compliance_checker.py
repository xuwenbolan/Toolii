from __future__ import annotations

from typing import TypedDict

import cv2
import numpy as np
from PIL import Image

from app.processing.image_io import open_image


class ComplianceCheck(TypedDict):
    id: str
    label: str
    passed: bool
    severity: str
    message: str


def _to_gray_array(image: Image.Image) -> np.ndarray:
    rgb = image.convert("RGB")
    return cv2.cvtColor(np.array(rgb), cv2.COLOR_RGB2GRAY)


def _clamp_box(face: dict[str, object] | None, width: int, height: int) -> tuple[int, int, int, int] | None:
    if not face:
        return None
    x = max(0, min(width - 1, int(face.get("x", 0))))
    y = max(0, min(height - 1, int(face.get("y", 0))))
    w = max(1, min(width - x, int(face.get("w", width))))
    h = max(1, min(height - y, int(face.get("h", height))))
    return x, y, w, h


def _as_dict(value: object) -> dict[str, object]:
    if isinstance(value, dict):
        return value
    return {}


def _point_from_mapping(mapping: dict[str, object], key: str) -> tuple[float, float] | None:
    value = mapping.get(key)
    if not isinstance(value, (list, tuple)) or len(value) < 2:
        return None
    try:
        return float(value[0]), float(value[1])
    except (ValueError, TypeError, IndexError):
        return None


def _safe_roi(gray: np.ndarray, box: tuple[int, int, int, int] | None) -> np.ndarray:
    if box is None:
        return gray
    x, y, w, h = box
    roi = gray[y : y + h, x : x + w]
    if roi.size == 0:
        return gray
    return roi


def _lighting_delta(gray_roi: np.ndarray) -> float:
    if gray_roi.size == 0:
        return 1.0
    h, w = gray_roi.shape[:2]
    if h < 4 or w < 4:
        return 0.0
    left = gray_roi[:, : max(1, w // 2)]
    right = gray_roi[:, max(1, w // 2) :]
    top = gray_roi[: max(1, h // 2), :]
    bottom = gray_roi[max(1, h // 2) :, :]

    mean_ref = max(1.0, float(gray_roi.mean()))
    lr = abs(float(left.mean()) - float(right.mean())) / mean_ref if right.size else 0.0
    tb = abs(float(top.mean()) - float(bottom.mean())) / mean_ref if bottom.size else 0.0
    return float(max(lr, tb))


def _alpha_background_quality(cutout_png_bytes: bytes | None) -> dict[str, object] | None:
    if not cutout_png_bytes:
        return None

    try:
        rgba = open_image(cutout_png_bytes).convert("RGBA")
    except (OSError, ValueError):
        return None

    alpha = np.array(rgba.getchannel("A"), dtype=np.uint8)
    h, w = alpha.shape[:2]
    total = max(1, h * w)

    fg = alpha > 20
    fg_pixels = int(fg.sum())
    if fg_pixels == 0:
        return {
            "score": 0.0,
            "usable": False,
            "foreground_ratio": 0.0,
            "transparent_ratio": round(float((alpha < 5).sum() / total), 4),
            "subject_box": None,
        }

    ys, xs = np.where(fg)
    x0, x1 = int(xs.min()), int(xs.max())
    y0, y1 = int(ys.min()), int(ys.max())
    bw = x1 - x0 + 1
    bh = y1 - y0 + 1
    fg_ratio = float(fg_pixels / total)
    transparent_ratio = float((alpha < 5).sum() / total)
    semi_ratio = float(((alpha >= 5) & (alpha <= 250)).sum() / total)
    subject_box = {"x": x0, "y": y0, "w": int(bw), "h": int(bh)}

    center_dx = abs((x0 + bw / 2) - (w / 2)) / max(1.0, w / 2)
    center_dy = abs((y0 + bh / 2) - (h / 2)) / max(1.0, h / 2)
    center_offset = float((center_dx + center_dy) / 2)

    score = 0.0
    if 0.05 <= fg_ratio <= 0.85:
        score += 0.35
    elif fg_ratio >= 0.02:
        score += 0.18
    if transparent_ratio >= 0.01:
        score += 0.2
    elif transparent_ratio >= 0.002:
        score += 0.08
    if 0.002 <= semi_ratio <= 0.25:
        score += 0.2
    elif semi_ratio < 0.35:
        score += 0.1
    if center_offset <= 0.35:
        score += 0.15
    elif center_offset <= 0.5:
        score += 0.08
    if y0 > 0 and y1 < h - 1:
        score += 0.1

    score = max(0.0, min(1.0, score))
    usable = bool(score >= 0.48 and transparent_ratio >= 0.002 and fg_ratio >= 0.02)
    return {
        "score": round(score, 4),
        "usable": usable,
        "foreground_ratio": round(fg_ratio, 4),
        "transparent_ratio": round(transparent_ratio, 4),
        "subject_box": subject_box,
    }


def check_photo_compliance(
    image_bytes: bytes,
    *,
    faces: list[dict[str, object]] | None = None,
    cutout_png_bytes: bytes | None = None,
    detection_engine: str | None = None,
) -> dict[str, object]:
    image = open_image(image_bytes)
    width, height = image.size
    gray = _to_gray_array(image)

    face_count = len(faces or [])
    face = faces[0] if face_count > 0 else None
    face_box = _clamp_box(face, width, height)

    face_roi = _safe_roi(gray, face_box)
    brightness = float(face_roi.mean())
    contrast = float(face_roi.std())
    sharpness = float(cv2.Laplacian(face_roi, cv2.CV_64F).var())
    lighting_delta = _lighting_delta(face_roi)
    p10 = float(np.percentile(face_roi, 10))
    p90 = float(np.percentile(face_roi, 90))
    tonal_span = p90 - p10

    landmarks = _as_dict(face.get("landmarks")) if face else {}
    features = _as_dict(face.get("features")) if face else {}
    eyes = [item for item in features.get("eyes", []) if isinstance(item, dict)] if features else []
    smiles = [item for item in features.get("smiles", []) if isinstance(item, dict)] if features else []
    eyes_detected = int(landmarks.get("eyes_detected", len(eyes) if eyes else 0)) if landmarks else len(eyes)
    smile_detected = bool(landmarks.get("smile_detected", bool(smiles))) if landmarks else bool(smiles)

    left_eye = _point_from_mapping(landmarks, "left_eye")
    right_eye = _point_from_mapping(landmarks, "right_eye")
    mouth = _point_from_mapping(landmarks, "mouth")
    chin = _point_from_mapping(landmarks, "chin")
    head_top_guess = _point_from_mapping(landmarks, "head_top_guess")

    eye_angle = float(landmarks.get("eye_angle_deg", 0.0)) if landmarks else 0.0
    eye_distance = float(landmarks.get("eye_distance", 0.0)) if landmarks else 0.0

    alpha_quality = _alpha_background_quality(cutout_png_bytes)
    alpha_subject_box = _as_dict(alpha_quality["subject_box"]) if alpha_quality and alpha_quality.get("subject_box") else {}

    face_ratio = None
    centered = False
    centered_offset_ratio = None
    eye_openness = None
    mouth_in_lower_face = None
    head_height_ratio = None
    if face_box:
        fx, fy, fw, fh = face_box
        head_top_y = float(head_top_guess[1]) if head_top_guess else float(fy)
        chin_y = float(chin[1]) if chin else float(fy + fh)
        if alpha_subject_box:
            alpha_top = float(alpha_subject_box.get("y", fy))
            alpha_h = float(alpha_subject_box.get("h", fh))
            alpha_bottom = alpha_top + alpha_h
            head_top_y = min(head_top_y, alpha_top)
            chin_y = max(chin_y, min(alpha_bottom, float(height - 1)))
        head_span = max(1.0, chin_y - head_top_y)
        face_ratio = fh / max(1, height)
        head_height_ratio = float(head_span / max(1, height))

        if left_eye and right_eye:
            cx = (left_eye[0] + right_eye[0]) / 2
            cy = (left_eye[1] + right_eye[1]) / 2
        else:
            cx = fx + fw / 2
            cy = fy + fh * 0.42
        centered_offset_ratio = abs(cx - width / 2) / max(1.0, width / 2)
        centered = centered_offset_ratio <= 0.18 and 0.12 <= (cy / max(1, height)) <= 0.6

        if eyes and fw > 0:
            eye_ratios: list[float] = []
            for eye in eyes[:2]:
                ew = float(eye.get("w", 0))
                eh = float(eye.get("h", 0))
                if ew > 0 and eh > 0:
                    eye_ratios.append(eh / ew)
            if eye_ratios:
                eye_openness = float(sum(eye_ratios) / len(eye_ratios))

        if mouth:
            mouth_in_lower_face = bool(fy + fh * 0.52 <= mouth[1] <= fy + fh * 0.96)

    checks: list[ComplianceCheck] = []

    def add_check(check_id: str, label: str, passed: bool, message: str, severity: str = "warning") -> None:
        checks.append(
            {
                "id": check_id,
                "label": label,
                "passed": bool(passed),
                "severity": severity,
                "message": message,
            }
        )

    add_check("face_detected", "检测到人脸", face_count > 0, "已检测到人脸" if face_count > 0 else "未检测到人脸", "error")
    add_check("single_face", "单人照片", face_count == 1, f"检测到 {face_count} 张人脸", "error")
    add_check("resolution", "分辨率充足", width >= 600 and height >= 600, f"{width}x{height}px", "error")
    add_check(
        "brightness",
        "亮度适中",
        78 <= brightness <= 210 and lighting_delta <= 0.28,
        f"亮度 {brightness:.0f}，光照差异 {lighting_delta:.2f}",
    )
    add_check("contrast", "对比度足够", contrast >= 20 and tonal_span >= 35, f"对比度 {contrast:.1f}，明暗跨度 {tonal_span:.0f}")
    add_check("sharpness", "清晰度", sharpness >= 45, f"锐度指标 {sharpness:.1f}")
    add_check(
        "centered",
        "人脸居中",
        centered if face_box else False,
        "人脸位置居中"
        if centered
        else (
            f"横向偏移 {centered_offset_ratio:.2f}"
            if centered_offset_ratio is not None
            else "建议调整构图"
        ),
    )
    add_check(
        "face_ratio",
        "头部比例",
        (0.5 <= head_height_ratio <= 0.8) if head_height_ratio is not None else False,
        (
            f"头部高度占比 {(head_height_ratio * 100):.0f}%（bbox {(face_ratio * 100):.0f}%）"
            if head_height_ratio is not None and face_ratio is not None
            else "未检测到头部比例"
        ),
        "error",
    )
    add_check(
        "head_tilt",
        "头部角度",
        (abs(eye_angle) <= 8.0) if eyes_detected >= 2 else False,
        (
            f"双眼连线角度 {eye_angle:.1f}°"
            if eyes_detected >= 2
            else "未稳定检测到双眼，无法精确估计头部倾斜"
        ),
    )
    eyes_open_pass = bool(
        eyes_detected >= 2
        and (eye_openness is None or eye_openness >= 0.14)
        and (eye_distance <= 0 or (face_box and eye_distance >= face_box[2] * 0.18))
    )
    add_check(
        "eyes_open",
        "双眼状态",
        eyes_open_pass,
        (
            f"检测到 {eyes_detected} 只眼，开眼指标 {eye_openness:.2f}"
            if eye_openness is not None
            else f"检测到 {eyes_detected} 只眼"
        ),
    )
    mouth_closed_pass = bool(not smile_detected and (mouth_in_lower_face is not False))
    add_check(
        "mouth_closed",
        "嘴部状态",
        mouth_closed_pass,
        "未检测到明显微笑/张嘴特征"
        if mouth_closed_pass
        else "检测到微笑或嘴部位置异常，建议闭嘴重拍",
    )
    expression_pass = bool(not smile_detected and abs(eye_angle) <= 10 and eyes_detected >= 2)
    add_check(
        "expression",
        "表情自然",
        expression_pass,
        "表情与姿态接近证件照要求"
        if expression_pass
        else "建议保持中性表情、直视镜头",
    )
    background_pass = bool(alpha_quality is None or alpha_quality.get("usable"))
    bg_msg = "背景抠图质量可用于替换底色"
    if alpha_quality is not None:
        bg_msg = (
            f"抠图质量 {float(alpha_quality.get('score', 0.0)):.2f}，"
            f"前景占比 {float(alpha_quality.get('foreground_ratio', 0.0)):.2f}"
        )
    if detection_engine and "profile" in detection_engine:
        bg_msg += "；检测到侧脸特征，结果需人工复核"
    add_check("background", "背景可替换", background_pass, bg_msg)

    critical_fail = any((not c["passed"]) and c["severity"] == "error" for c in checks)
    total_weight = 0
    passed_weight = 0
    for item in checks:
        weight = 3 if item["severity"] == "error" else 1
        total_weight += weight
        if item["passed"]:
            passed_weight += weight
    score = int(round(passed_weight * 100 / max(1, total_weight)))

    return {
        "passed": not critical_fail,
        "score": score,
        "checks": checks,
    }
