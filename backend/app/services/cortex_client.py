"""HTTP client for Toolii Cortex GPU inference service.

Provides a unified ``call()`` function that transparently forwards
parameters to Cortex.  Only ``remove_background`` has a local CPU
fallback (rembg silueta); all other GPU operations return errors
when Cortex is unavailable.
"""
from __future__ import annotations

import asyncio
import base64
import logging
from functools import partial
from typing import Any

import httpx

from app.core.config import settings
from app.core.exceptions import AppError

logger = logging.getLogger(__name__)
_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client  # noqa: PLW0603
    if _client is None:
        headers = {}
        if settings.cortex_api_key:
            headers["X-API-Key"] = settings.cortex_api_key
        _client = httpx.AsyncClient(
            base_url=settings.cortex_url,
            headers=headers,
            timeout=httpx.Timeout(connect=5.0, read=120.0, write=30.0, pool=5.0),
        )
    return _client


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


async def call(endpoint: str, *, image_b64: str, **params: Any) -> dict[str, Any]:
    """Unified Cortex call with single retry for transient errors.

    Parses Cortex structured error responses and converts them to AppError
    so error codes (GPU_BUSY, MODEL_NOT_FOUND, etc.) propagate to the client.
    """
    client = _get_client()
    payload: dict[str, Any] = {"image_b64": image_b64, **params}
    try:
        resp = await client.post(endpoint, json=payload)
    except (httpx.ConnectError, httpx.TimeoutException) as exc:
        logger.warning("Cortex %s transient error (%s), retrying once", endpoint, type(exc).__name__)
        await asyncio.sleep(0.5)
        resp = await client.post(endpoint, json=payload)

    if resp.status_code >= 400:
        _raise_cortex_error(endpoint, resp)

    return resp.json()


def _raise_cortex_error(endpoint: str, resp: httpx.Response) -> None:
    """Parse Cortex JSON error body and raise AppError with the original code."""
    code = "IMAGE_PROCESS_FAILED"
    message = f"Cortex {endpoint} failed"
    try:
        body = resp.json()
        err = body.get("error", {})
        code = err.get("code", code)
        message = err.get("message", message)
    except Exception:
        pass

    # Map Cortex HTTP status to backend status
    status = 502 if resp.status_code >= 500 else resp.status_code
    logger.warning("Cortex %s returned %d: %s / %s", endpoint, resp.status_code, code, message)
    raise AppError(code=code, message=message, status_code=status)


async def remove_background(image_bytes: bytes, **params: Any) -> dict[str, Any]:
    """Try Cortex GPU, fall back to local rembg silueta.

    Returns a dict with ``image_b64`` and ``meta`` keys, matching the
    Cortex response format even when using the local fallback.
    """
    try:
        return await call("/v1/remove-background", image_b64=_b64(image_bytes), **params)
    except Exception:
        logger.warning(
            "Cortex remove-background failed, falling back to local silueta",
            exc_info=True,
        )
        from app.processing.background_removal import remove_background as local_remove_bg

        loop = asyncio.get_running_loop()
        png_bytes, meta = await loop.run_in_executor(
            None, partial(local_remove_bg, image_bytes, model_name="silueta"),
        )
        return {"image_b64": _b64(png_bytes), "meta": meta if isinstance(meta, dict) else {}}


async def health_check() -> dict[str, Any]:
    """Check Cortex health.  Raises on failure."""
    client = _get_client()
    resp = await client.get("/health")
    resp.raise_for_status()
    return resp.json()


async def models_status() -> dict[str, Any]:
    """Fetch detailed model registry and load status from Cortex."""
    client = _get_client()
    resp = await client.get("/models")
    resp.raise_for_status()
    return resp.json()


async def models_check_all() -> dict[str, Any]:
    """Validate all registered models on Cortex."""
    client = _get_client()
    resp = await client.get("/models/check")
    resp.raise_for_status()
    return resp.json()


async def model_check(model_name: str) -> dict[str, Any]:
    """Validate a single model on Cortex."""
    client = _get_client()
    resp = await client.get(f"/models/{model_name}/check")
    resp.raise_for_status()
    return resp.json()


async def unload_all() -> dict[str, Any]:
    """Unload all models on Cortex to free VRAM."""
    client = _get_client()
    resp = await client.post("/admin/unload-all")
    resp.raise_for_status()
    return resp.json()


async def fetch_timeline(last: int = 300) -> dict[str, Any]:
    """Fetch recent VRAM timeline samples from Cortex."""
    client = _get_client()
    resp = await client.get("/stats/timeline", params={"last": last})
    resp.raise_for_status()
    return resp.json()


async def close() -> None:
    """Close the HTTP client connection pool."""
    global _client  # noqa: PLW0603
    if _client is not None:
        await _client.aclose()
        _client = None
