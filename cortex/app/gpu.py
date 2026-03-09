"""GPU monitoring via pynvml. Replaces nvidia-smi subprocess calls."""
from __future__ import annotations

import logging
import threading
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass
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


def gpu_info_extended() -> dict[str, Any]:
    """Return extended GPU info with utilization, driver, temperature, power."""
    info = gpu_info()
    if _handle is None:
        return info

    try:
        rates = pynvml.nvmlDeviceGetUtilizationRates(_handle)
        info["gpu_utilization_pct"] = rates.gpu
        info["memory_utilization_pct"] = rates.memory
    except pynvml.NVMLError:
        info["gpu_utilization_pct"] = None
        info["memory_utilization_pct"] = None

    try:
        info["driver_version"] = pynvml.nvmlSystemGetDriverVersion()
    except pynvml.NVMLError:
        info["driver_version"] = None

    try:
        cuda_ver = pynvml.nvmlSystemGetCudaDriverVersion_v2()
        info["cuda_version"] = f"{cuda_ver // 1000}.{(cuda_ver % 1000) // 10}"
    except pynvml.NVMLError:
        info["cuda_version"] = None

    try:
        info["temperature_c"] = pynvml.nvmlDeviceGetTemperature(
            _handle, pynvml.NVML_TEMPERATURE_GPU,
        )
    except pynvml.NVMLError:
        info["temperature_c"] = None

    try:
        info["power_watts"] = round(pynvml.nvmlDeviceGetPowerUsage(_handle) / 1000, 1)
    except pynvml.NVMLError:
        info["power_watts"] = None

    return info


def gpu_snapshot() -> dict[str, Any]:
    """Lightweight GPU performance snapshot for inference profiling.

    Returns only runtime metrics (no driver/cuda version).
    Costs ~4 pynvml calls, sub-millisecond.
    """
    if _handle is None:
        return {}
    result: dict[str, Any] = {}
    try:
        mem = pynvml.nvmlDeviceGetMemoryInfo(_handle)
        result["vram_used_mb"] = int(mem.used // (1024 * 1024))
    except pynvml.NVMLError:
        pass
    try:
        rates = pynvml.nvmlDeviceGetUtilizationRates(_handle)
        result["gpu_utilization_pct"] = rates.gpu
    except pynvml.NVMLError:
        pass
    try:
        result["temperature_c"] = pynvml.nvmlDeviceGetTemperature(
            _handle, pynvml.NVML_TEMPERATURE_GPU,
        )
    except pynvml.NVMLError:
        pass
    try:
        result["power_watts"] = round(pynvml.nvmlDeviceGetPowerUsage(_handle) / 1000, 1)
    except pynvml.NVMLError:
        pass
    return result


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


# -- System RAM monitoring ---------------------------------------------------


def system_ram_used_mb() -> int:
    """Return system RAM used in MB by reading /proc/meminfo."""
    try:
        total_kb = available_kb = 0
        with open("/proc/meminfo") as f:
            for line in f:
                if line.startswith("MemTotal:"):
                    total_kb = int(line.split()[1])
                elif line.startswith("MemAvailable:"):
                    available_kb = int(line.split()[1])
                if total_kb and available_kb:
                    break
        return (total_kb - available_kb) // 1024
    except OSError:
        return 0


# -- Continuous VRAM timeline sampler ----------------------------------------


@dataclass
class VramSample:
    timestamp: float
    vram_used_mb: int
    vram_total_mb: int
    system_ram_used_mb: int
    loaded_models: int = 0
    event: str = ""


class VramTimeline:
    """Two-tier RRD-style VRAM sampler.

    Hot tier:  1-second resolution, last 1 hour  (~3 600 samples).
    Cold tier: 30-second resolution (peak per window), up to 47 hours (~5 640 samples).
    Total coverage: 48 hours, ~9 240 samples, ~2.5 MB.
    """

    _HOT_SECONDS = 3600
    _COLD_INTERVAL = 30
    _COLD_MAXLEN = 47 * 3600 // 30  # 5640

    def __init__(self) -> None:
        self._hot: deque[VramSample] = deque()
        self._cold: deque[VramSample] = deque(maxlen=self._COLD_MAXLEN)
        self._model_count_fn: Callable[[], int] | None = None
        self._stop = threading.Event()
        self._pending_event: str = ""
        self._lock = threading.Lock()

    def start(self, model_count_fn: Callable[[], int], interval: float = 1.0) -> None:
        """Start background sampling daemon thread."""
        self._model_count_fn = model_count_fn
        t = threading.Thread(
            target=self._sample_loop,
            args=(interval,),
            daemon=True,
            name="vram-timeline",
        )
        t.start()
        logger.info(
            "VRAM timeline sampler started (interval=%.1fs, hot=%ds, cold=%ds@%ds)",
            interval, self._HOT_SECONDS,
            self._COLD_MAXLEN * self._COLD_INTERVAL, self._COLD_INTERVAL,
        )

    def stop(self) -> None:
        self._stop.set()

    def mark_event(self, event: str) -> None:
        """Tag the next sample with an event label."""
        with self._lock:
            self._pending_event = event

    def get_samples(self, last_n: int = 0) -> list[dict[str, Any]]:
        """Return recent samples as dicts. last_n=0 returns all."""
        with self._lock:
            merged = list(self._cold) + list(self._hot)
        if last_n > 0:
            merged = merged[-last_n:]
        return [
            {
                "t": s.timestamp,
                "vram_used_mb": s.vram_used_mb,
                "vram_total_mb": s.vram_total_mb,
                "sys_ram_mb": s.system_ram_used_mb,
                "models": s.loaded_models,
                "event": s.event,
            }
            for s in merged
        ]

    def shared_memory_detected(self) -> bool:
        """Check if recent samples suggest shared GPU memory usage.

        Indicators:
        - VRAM used >= 98% of total (physical VRAM nearly exhausted)
        - System RAM spiked > 500MB between adjacent samples
        """
        with self._lock:
            samples = list(self._hot)
        if len(samples) < 2:
            return False
        for i in range(max(0, len(samples) - 60), len(samples)):
            s = samples[i]
            if s.vram_total_mb > 0 and s.vram_used_mb >= s.vram_total_mb * 0.98:
                return True
            if i > 0:
                ram_delta = s.system_ram_used_mb - samples[i - 1].system_ram_used_mb
                if ram_delta > 500:
                    return True
        return False

    def _sample_loop(self, interval: float) -> None:
        compact_counter = 0
        while not self._stop.is_set():
            try:
                self._take_sample()
            except Exception:
                logger.debug("VRAM sample failed", exc_info=True)
            compact_counter += 1
            if compact_counter >= self._COLD_INTERVAL:
                try:
                    self._compact()
                except Exception:
                    logger.debug("VRAM compact failed", exc_info=True)
                compact_counter = 0
            self._stop.wait(interval)

    def _take_sample(self) -> None:
        with self._lock:
            event = self._pending_event
            self._pending_event = ""
        model_count = self._model_count_fn() if self._model_count_fn else 0
        sample = VramSample(
            timestamp=time.time(),
            vram_used_mb=vram_used_mb(),
            vram_total_mb=vram_total_mb(),
            system_ram_used_mb=system_ram_used_mb(),
            loaded_models=model_count,
            event=event,
        )
        with self._lock:
            self._hot.append(sample)

    def _compact(self) -> None:
        """Move expired hot samples to cold tier with peak aggregation."""
        cutoff = time.time() - self._HOT_SECONDS
        with self._lock:
            expired: list[VramSample] = []
            while self._hot and self._hot[0].timestamp < cutoff:
                expired.append(self._hot.popleft())
            if not expired:
                return
            peak = max(expired, key=lambda s: s.vram_used_mb)
            self._cold.append(peak)
            for s in expired:
                if s.event and s is not peak:
                    self._cold.append(s)
