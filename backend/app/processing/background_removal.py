from __future__ import annotations

import io
from typing import Any

import cv2
import numpy as np
from PIL import Image

from app.processing.image_io import open_image


_sessions: dict[str, Any] = {}
_MODEL_PRIORITY = ["silueta", "u2net_human_seg"]


def warmup_background_model(model_name: str) -> bool:
    try:
        from rembg import new_session  # type: ignore
    except ImportError:
        return False

    if model_name in _sessions:
        return True

    try:
        _sessions[model_name] = new_session(model_name=model_name)
        return True
    except (OSError, RuntimeError, ValueError):
        return False


def prewarm_background_models(model_names: list[str]) -> dict[str, bool]:
    return {name: warmup_background_model(name) for name in model_names}


def _ensure_rgba_png_bytes(img: Image.Image) -> bytes:
    rgba = img.convert("RGBA")
    buf = io.BytesIO()
    rgba.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _alpha_quality(img: Image.Image) -> dict[str, object]:
    rgba = img.convert("RGBA")
    alpha = np.array(rgba.getchannel("A"), dtype=np.uint8)
    h, w = alpha.shape[:2]
    total = max(1, h * w)

    fg_mask = alpha > 20
    fg_pixels = int(fg_mask.sum())
    fg_ratio = float(fg_pixels / total)
    transparent_ratio = float((alpha < 5).sum() / total)
    semi_ratio = float(((alpha >= 5) & (alpha <= 250)).sum() / total)

    subject_box: dict[str, int] | None = None
    bbox_area_ratio = 0.0
    center_offset_ratio = 1.0
    border_touches = 0
    components = 0

    if fg_pixels > 0:
        ys, xs = np.where(fg_mask)
        x0 = int(xs.min())
        y0 = int(ys.min())
        x1 = int(xs.max())
        y1 = int(ys.max())
        bw = int(x1 - x0 + 1)
        bh = int(y1 - y0 + 1)
        subject_box = {"x": x0, "y": y0, "w": bw, "h": bh}
        bbox_area_ratio = float((bw * bh) / total)

        cx = x0 + bw / 2
        cy = y0 + bh / 2
        center_dx = abs(cx - (w / 2)) / max(1.0, w / 2)
        center_dy = abs(cy - (h / 2)) / max(1.0, h / 2)
        center_offset_ratio = float((center_dx + center_dy) / 2)

        if x0 <= 1:
            border_touches += 1
        if y0 <= 1:
            border_touches += 1
        if x1 >= w - 2:
            border_touches += 1
        if y1 >= h - 2:
            border_touches += 1

        if fg_pixels > 30:
            labels, _ = cv2.connectedComponents(fg_mask.astype(np.uint8))
            components = max(0, int(labels) - 1)

    score = 0.0
    if 0.06 <= fg_ratio <= 0.82:
        score += 0.34
    elif 0.02 <= fg_ratio <= 0.92:
        score += 0.18

    if transparent_ratio >= 0.03:
        score += 0.16
    elif transparent_ratio >= 0.005:
        score += 0.08

    if 0.08 <= bbox_area_ratio <= 0.9:
        score += 0.12

    if center_offset_ratio <= 0.28:
        score += 0.12
    elif center_offset_ratio <= 0.4:
        score += 0.06

    if 0.002 <= semi_ratio <= 0.25:
        score += 0.1
    elif semi_ratio < 0.4:
        score += 0.04

    if components and components <= 6:
        score += 0.1
    elif fg_pixels > 0 and components == 0:
        score += 0.06
    elif components <= 15:
        score += 0.04

    if border_touches <= 1:
        score += 0.06
    elif border_touches == 2:
        score += 0.03

    score = max(0.0, min(1.0, score))
    usable = bool(
        fg_pixels > 0
        and fg_ratio >= 0.02
        and transparent_ratio >= 0.002
        and (subject_box is not None)
        and score >= 0.42
    )

    return {
        "score": round(score, 4),
        "usable": usable,
        "foreground_ratio": round(fg_ratio, 4),
        "transparent_ratio": round(transparent_ratio, 4),
        "semi_transparent_ratio": round(semi_ratio, 4),
        "bbox_area_ratio": round(bbox_area_ratio, 4),
        "center_offset_ratio": round(center_offset_ratio, 4),
        "border_touches": border_touches,
        "components": components,
        "subject_box": subject_box,
    }


def _candidate_models(model_name: str) -> list[str]:
    ordered = [model_name, *_MODEL_PRIORITY]
    result: list[str] = []
    for name in ordered:
        if name and name not in result:
            result.append(name)
    return result


def remove_background(
    image_bytes: bytes,
    *,
    model_name: str = "silueta",
) -> tuple[bytes, dict[str, object]]:
    base_img = open_image(image_bytes)

    try:
        from rembg import remove  # type: ignore
    except ImportError:
        return _ensure_rgba_png_bytes(base_img), {"engine": "none", "model": None}

    attempts: list[dict[str, object]] = []
    best_bytes: bytes | None = None
    best_meta: dict[str, object] | None = None
    best_score = -1.0

    for candidate in _candidate_models(model_name):
        session = _sessions.get(candidate)
        if session is None:
            warmup_background_model(candidate)
            session = _sessions.get(candidate)

        try:
            result_bytes = remove(image_bytes, session=session)
            out_img = open_image(result_bytes).convert("RGBA")
            encoded = _ensure_rgba_png_bytes(out_img)
            alpha_meta = _alpha_quality(out_img)
            score = float(alpha_meta.get("score", 0.0))
            attempts.append(
                {
                    "model": candidate,
                    "ok": True,
                    "score": score,
                    "usable": bool(alpha_meta.get("usable", False)),
                }
            )
            if score > best_score:
                best_score = score
                best_bytes = encoded
                best_meta = {
                    "engine": "rembg",
                    "model": candidate,
                    "alpha_quality": alpha_meta,
                    "subject_box": alpha_meta.get("subject_box"),
                }
            if alpha_meta.get("usable") and score >= 0.68:
                break
        except (OSError, RuntimeError, ValueError):
            attempts.append({"model": candidate, "ok": False})

    if best_bytes is not None and best_meta is not None:
        best_meta["attempted_models"] = attempts
        return best_bytes, best_meta

    fallback_bytes = _ensure_rgba_png_bytes(base_img)
    fallback_img = open_image(fallback_bytes).convert("RGBA")
    alpha_meta = _alpha_quality(fallback_img)
    return (
        fallback_bytes,
        {
            "engine": "fallback-original",
            "model": None,
            "alpha_quality": alpha_meta,
            "subject_box": None,
            "attempted_models": attempts,
        },
    )
