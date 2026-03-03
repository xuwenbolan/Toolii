"""GPU monitoring via pynvml. Replaces nvidia-smi subprocess calls."""
from __future__ import annotations

import logging
from typing import Any

import pynvml

logger = logging.getLogger(__name__)

_handle: Any = None


def init(device_id: int = 0) -> None:
    """Initialize NVML and acquire GPU handle. Call once at startup."""
    global _handle
    pynvml.nvmlInit()
    _handle = pynvml.nvmlDeviceGetHandleByIndex(device_id)
    name = gpu_name()
    total = vram_total_mb()
    logger.info("GPU initialized: %s (%d MB VRAM)", name, total)


def shutdown() -> None:
    """Shutdown NVML. Call at application exit."""
    global _handle
    _handle = None
    try:
        pynvml.nvmlShutdown()
    except pynvml.NVMLError:
        pass


def gpu_name() -> str:
    if _handle is None:
        return "unknown"
    return pynvml.nvmlDeviceGetName(_handle)


def vram_total_mb() -> int:
    if _handle is None:
        return 0
    mem = pynvml.nvmlDeviceGetMemoryInfo(_handle)
    return mem.total // (1024 * 1024)


def vram_used_mb() -> int:
    if _handle is None:
        return 0
    mem = pynvml.nvmlDeviceGetMemoryInfo(_handle)
    return mem.used // (1024 * 1024)


def vram_free_mb() -> int:
    if _handle is None:
        return 0
    mem = pynvml.nvmlDeviceGetMemoryInfo(_handle)
    return mem.free // (1024 * 1024)


def gpu_info() -> dict[str, Any]:
    """Return GPU info dict for /health endpoint."""
    if _handle is None:
        return {"name": "unknown", "vram_total_mb": 0, "vram_used_mb": 0, "vram_free_mb": 0}
    mem = pynvml.nvmlDeviceGetMemoryInfo(_handle)
    return {
        "name": pynvml.nvmlDeviceGetName(_handle),
        "vram_total_mb": mem.total // (1024 * 1024),
        "vram_used_mb": mem.used // (1024 * 1024),
        "vram_free_mb": mem.free // (1024 * 1024),
    }


def auto_budget(reserve_mb: int = 0) -> int:
    """Calculate VRAM budget automatically.

    Reserve = min(4096, total * 0.25).
    Budget = total - reserve.
    """
    total = vram_total_mb()
    if total == 0:
        return 0
    reserve = min(4096, int(total * 0.25)) if reserve_mb <= 0 else reserve_mb
    return max(0, total - reserve)
