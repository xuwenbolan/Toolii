"""HTTP client for Toolii Cortex GPU inference service.

Provides a unified ``call()`` function that transparently forwards
parameters to Cortex.  Only ``remove_background`` has a local CPU
fallback (rembg silueta); all other GPU operations return errors
when Cortex is unavailable.

Includes a simple circuit breaker: after ``_CB_THRESHOLD`` consecutive
connection failures, the circuit opens for ``_CB_COOLDOWN`` seconds and
calls fail fast without hitting the network.
"""
from __future__ import annotations

import asyncio
import base64
import logging
import time
from functools import partial
from typing import Any

import httpx

from app.core.config import settings
from app.core.exceptions import AppError

logger = logging.getLogger(__name__)
_client: httpx.AsyncClient | None = None

# Circuit breaker state
_cb_failures: int = 0
_cb_open_until: float = 0.0


def _get_client() -> httpx.AsyncClient:
    global _client  # noqa: PLW0603
    if _client is None:
        headers = {}
        if settings.cortex_api_key:
            headers["X-API-Key"] = settings.cortex_api_key
        _client = httpx.AsyncClient(
            base_url=settings.cortex_url,
            headers=headers,
            timeout=httpx.Timeout(
                connect=settings.cortex_timeout_connect,
                read=settings.cortex_timeout_read,
                write=settings.cortex_timeout_write,
                pool=settings.cortex_timeout_connect,
            ),
        )
    return _client


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def _cb_record_success() -> None:
    global _cb_failures, _cb_open_until  # noqa: PLW0603
    _cb_failures = 0
    _cb_open_until = 0.0


def _cb_record_failure() -> None:
    global _cb_failures, _cb_open_until  # noqa: PLW0603
    _cb_failures += 1
    if _cb_failures >= settings.cortex_cb_threshold:
        _cb_open_until = time.monotonic() + settings.cortex_cb_cooldown
        logger.warning("Cortex circuit breaker OPEN after %d failures, cooldown %.0fs", _cb_failures, settings.cortex_cb_cooldown)


def _cb_check() -> None:
    """Raise AppError immediately if circuit breaker is open."""
    if _cb_open_until and time.monotonic() < _cb_open_until:
        raise AppError(
            code="SERVICE_UNAVAILABLE",
            message="GPU service temporarily unavailable, please try again later",
            status_code=503,
        )


async def call(endpoint: str, *, image_b64: str, **params: Any) -> dict[str, Any]:
    """Unified Cortex call with single retry for transient errors.

    Parses Cortex structured error responses and converts them to AppError
    so error codes (GPU_BUSY, MODEL_NOT_FOUND, etc.) propagate to the client.
    Uses a circuit breaker to avoid cascading timeouts when Cortex is down.
    """
    _cb_check()
    client = _get_client()
    payload: dict[str, Any] = {"image_b64": image_b64, **params}
    try:
        resp = await client.post(endpoint, json=payload)
    except (httpx.ConnectError, httpx.TimeoutException) as exc:
        logger.warning("Cortex %s transient error (%s), retrying once", endpoint, type(exc).__name__)
        await asyncio.sleep(settings.cortex_retry_delay)
        try:
            resp = await client.post(endpoint, json=payload)
        except (httpx.ConnectError, httpx.TimeoutException):
            _cb_record_failure()
            raise

    _cb_record_success()

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


async def unload_model(model_name: str) -> dict[str, Any]:
    """Unload a single model on Cortex."""
    client = _get_client()
    resp = await client.post(f"/admin/unload/{model_name}")
    resp.raise_for_status()
    return resp.json()


async def enable_model(model_name: str) -> dict[str, Any]:
    """Re-enable a disabled model on Cortex."""
    client = _get_client()
    resp = await client.post(f"/admin/models/{model_name}/enable")
    resp.raise_for_status()
    return resp.json()


async def disable_model(model_name: str) -> dict[str, Any]:
    """Disable a model on Cortex (unloads + rejects future requests)."""
    client = _get_client()
    resp = await client.post(f"/admin/models/{model_name}/disable")
    resp.raise_for_status()
    return resp.json()


async def close() -> None:
    """Close the HTTP client connection pool."""
    global _client  # noqa: PLW0603
    if _client is not None:
        await _client.aclose()
        _client = None
