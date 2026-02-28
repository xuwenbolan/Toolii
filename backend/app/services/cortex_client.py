"""HTTP client for Toolii Cortex GPU inference service.

Strategy: try Cortex first, fall back to local models on failure.
"""
from __future__ import annotations

import asyncio
import base64
import logging
from functools import partial
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)
_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client  # noqa: PLW0603
    if _client is None:
        _client = httpx.AsyncClient(
            base_url=settings.cortex_url,
            timeout=httpx.Timeout(connect=5.0, read=120.0, write=30.0, pool=5.0),
        )
    return _client


async def remove_background(
    image_bytes: bytes,
) -> tuple[bytes, dict[str, Any]]:
    """Try Cortex GPU (ben2), fall back to local rembg silueta."""
    try:
        client = _get_client()
        payload = {
            "image_b64": base64.b64encode(image_bytes).decode("ascii"),
            "model_name": "ben2",
        }
        resp = await client.post("/v1/remove-background", json=payload)
        if resp.status_code != 200:
            logger.warning("Cortex remove-background HTTP %s: %s", resp.status_code, resp.text)
        resp.raise_for_status()
        data = resp.json()
        png_bytes = base64.b64decode(data["image_b64"])
        return png_bytes, data["meta"]
    except Exception:
        logger.warning("Cortex remove-background failed, falling back to local silueta", exc_info=True)
        from app.processing.background_removal import remove_background as local_remove_bg

        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None, partial(local_remove_bg, image_bytes, model_name="silueta")
        )


async def detect_faces(image_bytes: bytes) -> dict[str, Any]:
    """Try Cortex GPU, fall back to local MediaPipe."""
    try:
        client = _get_client()
        payload = {"image_b64": base64.b64encode(image_bytes).decode("ascii")}
        resp = await client.post("/v1/detect-faces", json=payload)
        resp.raise_for_status()
        return resp.json()
    except Exception:
        logger.warning("Cortex detect-faces failed, falling back to local MediaPipe", exc_info=True)
        from app.processing.face_detection import detect_faces as local_detect_faces

        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None, partial(local_detect_faces, image_bytes)
        )


def _b64(image_bytes: bytes) -> str:
    return base64.b64encode(image_bytes).decode("ascii")


async def _post_image(
    endpoint: str,
    image_bytes: bytes,
    *,
    extra: dict[str, Any] | None = None,
) -> tuple[bytes, dict[str, Any]]:
    """POST image to Cortex and return (png_bytes, meta). No local fallback."""
    client = _get_client()
    payload: dict[str, Any] = {"image_b64": _b64(image_bytes)}
    if extra:
        payload.update(extra)
    resp = await client.post(endpoint, json=payload)
    resp.raise_for_status()
    data = resp.json()
    return base64.b64decode(data["image_b64"]), data.get("meta", {})


async def upscale(image_bytes: bytes, *, scale: int = 4) -> tuple[bytes, dict[str, Any]]:
    """Real-ESRGAN super resolution."""
    return await _post_image("/v1/upscale", image_bytes, extra={"scale": scale})


async def restore_face(image_bytes: bytes, *, w: float = 0.5) -> tuple[bytes, dict[str, Any]]:
    """CodeFormer face restoration."""
    return await _post_image("/v1/restore-face", image_bytes, extra={"w": w})


async def denoise(image_bytes: bytes, *, strength: float = 0.5) -> tuple[bytes, dict[str, Any]]:
    """NAFNet image denoising."""
    return await _post_image("/v1/denoise", image_bytes, extra={"strength": strength})


async def colorize(image_bytes: bytes) -> tuple[bytes, dict[str, Any]]:
    """DDColor black-and-white colorization."""
    return await _post_image("/v1/colorize", image_bytes)


async def inpaint(image_bytes: bytes, mask_bytes: bytes) -> tuple[bytes, dict[str, Any]]:
    """LaMa image inpainting."""
    client = _get_client()
    payload = {"image_b64": _b64(image_bytes), "mask_b64": _b64(mask_bytes)}
    resp = await client.post("/v1/inpaint", json=payload)
    resp.raise_for_status()
    data = resp.json()
    return base64.b64decode(data["image_b64"]), data.get("meta", {})


async def ocr(image_bytes: bytes, *, lang: str = "ch_en") -> dict[str, Any]:
    """PaddleOCR text recognition."""
    client = _get_client()
    payload: dict[str, Any] = {"image_b64": _b64(image_bytes), "lang": lang}
    resp = await client.post("/v1/ocr", json=payload)
    resp.raise_for_status()
    return resp.json()


async def segment(
    image_bytes: bytes,
    *,
    points: list[list[float]] | None = None,
    boxes: list[list[float]] | None = None,
) -> tuple[bytes, dict[str, Any]]:
    """SAM2 image segmentation. Returns (mask_png_bytes, meta)."""
    client = _get_client()
    payload: dict[str, Any] = {"image_b64": _b64(image_bytes)}
    if points is not None:
        payload["points"] = points
    if boxes is not None:
        payload["boxes"] = boxes
    resp = await client.post("/v1/segment", json=payload)
    resp.raise_for_status()
    data = resp.json()
    mask_bytes = base64.b64decode(data["mask_b64"])
    meta = {
        "engine": data.get("engine", "sam2"),
        "model": data.get("model", ""),
        "score": data.get("score", 0.0),
        "width": data.get("width", 0),
        "height": data.get("height", 0),
    }
    return mask_bytes, meta


async def health_check() -> dict[str, Any]:
    """Check Cortex health. Raises on failure."""
    client = _get_client()
    resp = await client.get("/health")
    resp.raise_for_status()
    return resp.json()


async def close() -> None:
    """Close the HTTP client connection pool."""
    global _client  # noqa: PLW0603
    if _client is not None:
        await _client.aclose()
        _client = None
