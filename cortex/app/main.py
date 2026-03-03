from __future__ import annotations

import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import gpu
from app.config import settings
from app.model_manager import OnnxModelManager

logging.basicConfig(level=settings.log_level)
logger = logging.getLogger(__name__)

_start_time = time.time()


def _resolve_budget() -> int:
    """Resolve VRAM budget: use configured value or auto-detect from GPU."""
    if settings.vram_budget_mb > 0:
        logger.info("VRAM budget: %dMB (manual)", settings.vram_budget_mb)
        return settings.vram_budget_mb
    budget = gpu.auto_budget()
    logger.info("VRAM budget: %dMB (auto: %dMB total - %dMB reserve)",
                budget, gpu.vram_total_mb(), gpu.vram_total_mb() - budget)
    return budget


# Initialize GPU monitoring and model manager
gpu.init()
budget = _resolve_budget()
manager = OnnxModelManager(vram_budget_mb=budget)


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
    gpu.shutdown()
    logger.info("Shutdown complete")


def create_app() -> FastAPI:
    app = FastAPI(title="Toolii Cortex", version="0.1.0", lifespan=lifespan)
    app.state.manager = manager

    from app.router import create_router

    app.include_router(create_router(manager))

    @app.get("/health")
    async def health() -> dict:
        return {
            "status": "ok",
            "gpu": gpu.gpu_info(),
            "models": manager.stats(),
            "uptime_seconds": int(time.time() - _start_time),
        }

    @app.get("/models")
    async def models_detail() -> dict:
        """Detailed model registry, load status, VRAM usage, and GPU memory."""
        detail = manager.detailed_stats()
        detail["gpu"] = gpu.gpu_info()
        detail["uptime_seconds"] = int(time.time() - _start_time)
        return detail

    @app.get("/models/check")
    async def models_check_all() -> dict:
        """Validate all registered models (file existence + ONNX integrity)."""
        result = manager.check_all()
        result["gpu"] = gpu.gpu_info()
        return result

    @app.get("/models/{model_name}/check")
    async def model_check(model_name: str) -> dict:
        """Validate a single model by name."""
        return manager.check_model(model_name)

    return app


app = create_app()
