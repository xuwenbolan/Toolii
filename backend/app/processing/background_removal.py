from __future__ import annotations

import io
import logging
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from PIL import Image

from app.processing.image_io import open_image

logger = logging.getLogger(__name__)

_MODEL_DIR = Path(__file__).resolve().parents[3] / "data" / "models"
_MODEL_URLS: dict[str, str] = {
    "silueta": "https://github.com/danielgatis/rembg/releases/download/v0.0.0/silueta.onnx",
    "u2net_human_seg": "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net_human_seg.onnx",
}
_MODEL_PRIORITY = ["silueta", "u2net_human_seg"]

# ImageNet normalization constants used by U2Net family models
_MEAN = (0.485, 0.456, 0.406)
_STD = (0.229, 0.224, 0.225)
_INPUT_SIZE = (320, 320)

_sessions: dict[str, Any] = {}


def _download_model(model_name: str) -> Path:
    """Download ONNX model if not present, return local path."""
    model_path = _MODEL_DIR / f"{model_name}.onnx"
    if model_path.exists():
        return model_path

    url = _MODEL_URLS.get(model_name)
    if not url:
        raise ValueError(f"Unknown background removal model: {model_name}")

    _MODEL_DIR.mkdir(parents=True, exist_ok=True)
    logger.info("Downloading %s model from %s", model_name, url)

    import httpx

    tmp_path = model_path.with_suffix(".onnx.tmp")
    with httpx.stream("GET", url, follow_redirects=True, timeout=120.0) as resp:
        resp.raise_for_status()
        with open(tmp_path, "wb") as f:
            for chunk in resp.iter_bytes(chunk_size=8192):
                f.write(chunk)
    tmp_path.rename(model_path)

    logger.info("Downloaded %s to %s", model_name, model_path)
    return model_path


def warmup_background_model(model_name: str) -> bool:
    try:
        import onnxruntime as ort
    except ImportError:
        return False

    if model_name in _sessions:
        return True

    try:
        model_path = _download_model(model_name)
        opts = ort.SessionOptions()
        opts.inter_op_num_threads = 2
        opts.intra_op_num_threads = 2
        _sessions[model_name] = ort.InferenceSession(
            str(model_path),
            sess_options=opts,
            providers=["CPUExecutionProvider"],
        )
        return True
    except (OSError, RuntimeError, ValueError):
        logger.warning("Failed to load background model %s", model_name, exc_info=True)
        return False


def prewarm_background_models(model_names: list[str]) -> dict[str, bool]:
    return {name: warmup_background_model(name) for name in model_names}


def _predict_mask(session: Any, img: Image.Image) -> Image.Image:
    """Run U2Net-family ONNX model to produce a grayscale alpha mask."""
    orig_size = img.size
    im = img.convert("RGB").resize(_INPUT_SIZE, Image.Resampling.LANCZOS)
    im_ary = np.array(im, dtype=np.float32)
    im_ary = im_ary / max(float(np.max(im_ary)), 1e-6)

    for c in range(3):
        im_ary[:, :, c] = (im_ary[:, :, c] - _MEAN[c]) / _STD[c]

    im_ary = im_ary.transpose((2, 0, 1))  # HWC -> CHW
    input_tensor = np.expand_dims(im_ary, 0).astype(np.float32)

    input_name = session.get_inputs()[0].name
    ort_outs = session.run(None, {input_name: input_tensor})

    pred = ort_outs[0][:, 0, :, :]
    ma, mi = float(np.max(pred)), float(np.min(pred))
    if ma - mi > 1e-6:
        pred = (pred - mi) / (ma - mi)
    pred = np.squeeze(pred).clip(0, 1)

    mask = Image.fromarray((pred * 255).astype(np.uint8), mode="L")
    mask = mask.resize(orig_size, Image.Resampling.LANCZOS)
    return mask


def _apply_mask(img: Image.Image, mask: Image.Image) -> Image.Image:
    """Apply grayscale mask as alpha channel to produce RGBA cutout."""
    empty = Image.new("RGBA", img.size, 0)
    return Image.composite(img.convert("RGBA"), empty, mask)


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

    if not _sessions:
        warmup_background_model(model_name)

    if not _sessions:
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

        if session is None:
            attempts.append({"model": candidate, "ok": False})
            continue

        try:
            mask = _predict_mask(session, base_img)
            out_img = _apply_mask(base_img, mask)
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
                    "engine": "onnxruntime",
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
