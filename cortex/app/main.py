from __future__ import annotations

import logging
import subprocess
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import settings
from app.model_manager import OnnxModelManager

logging.basicConfig(level=settings.log_level)
logger = logging.getLogger(__name__)

_start_time = time.time()
manager = OnnxModelManager()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    # Startup: register engines, warmup, start idle evictor
    from app.engines import ALL_ENGINES

    for engine in ALL_ENGINES:
        manager.register_many(engine.get_models())

    if settings.warmup:
        logger.info("Warming up required models...")
        manager.warmup(required_only=True)
        logger.info("Warmup complete: %s", manager.stats())

    manager.start_idle_evictor(settings.idle_evict_minutes)

    yield

    # Shutdown: release all ONNX sessions
    logger.info("Shutting down, unloading all models...")
    manager.unload_all()
    logger.info("Shutdown complete")


def create_app() -> FastAPI:
    app = FastAPI(title="Toolii Cortex", version="0.1.0", lifespan=lifespan)
    app.state.manager = manager

    from app.router import create_router

    app.include_router(create_router(manager))

    @app.get("/health")
    async def health() -> dict:
        gpu_info = _get_gpu_info()
        return {
            "status": "ok",
            "gpu": gpu_info,
            "models": manager.stats(),
            "uptime_seconds": int(time.time() - _start_time),
        }

    @app.get("/models")
    async def models_detail() -> dict:
        """Detailed model registry, load status, VRAM usage, and GPU memory."""
        detail = manager.detailed_stats()
        detail["gpu"] = _get_gpu_info()
        detail["uptime_seconds"] = int(time.time() - _start_time)
        return detail

    @app.get("/models/check")
    async def models_check_all() -> dict:
        """Validate all registered models (file existence + ONNX integrity)."""
        result = manager.check_all()
        result["gpu"] = _get_gpu_info()
        return result

    @app.get("/models/{model_name}/check")
    async def model_check(model_name: str) -> dict:
        """Validate a single model by name."""
        return manager.check_model(model_name)

    return app


def _get_gpu_info() -> dict:
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=name,memory.total,memory.used,memory.free",
                "--format=csv,nounits,noheader",
            ],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            parts = [p.strip() for p in result.stdout.strip().split(",")]
            return {
                "name": parts[0],
                "vram_total_mb": int(parts[1]),
                "vram_used_mb": int(parts[2]),
                "vram_free_mb": int(parts[3]),
            }
    except Exception:
        pass
    return {"name": "unknown", "vram_total_mb": 0, "vram_used_mb": 0, "vram_free_mb": 0}


app = create_app()
