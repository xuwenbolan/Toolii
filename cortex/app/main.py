from __future__ import annotations

import hmac
import json
import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app import gpu
from app.config import settings
from app.engines.base import BaseEngine
from app.model_manager import ModelDisabledError, OnnxModelManager
from app.router import CortexRouter, create_cortex_router

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


def _build_engine_map() -> dict[str, BaseEngine]:
    """Build engine name -> instance mapping from ALL_ENGINES."""
    from app.engines import ALL_ENGINES

    engine_map: dict[str, BaseEngine] = {}
    for e in ALL_ENGINES:
        # "BiRefNetEngine" -> "birefnet", "RealESRGANEngine" -> "realesrgan"
        key = type(e).__name__.removesuffix("Engine").lower()
        engine_map[key] = e
    return engine_map


# -- Stats persistence -----------------------------------------------------


def _load_stats(cortex: CortexRouter) -> None:
    """Restore inference stats from JSON file on startup."""
    if not settings.stats_file.exists():
        return
    try:
        data = json.loads(settings.stats_file.read_text())
        cortex.load_stats(data.get("inference", {}))
        logger.info("Restored stats from %s", settings.stats_file)
    except Exception:
        logger.warning("Failed to load stats from %s", settings.stats_file, exc_info=True)


def _save_stats(cortex: CortexRouter, manager: OnnxModelManager) -> None:
    """Persist inference stats and model events to JSON file on shutdown."""
    try:
        settings.stats_file.parent.mkdir(parents=True, exist_ok=True)
        data: dict[str, Any] = {
            "inference": cortex.dump_stats(),
            "events": [
                {
                    "timestamp": e.timestamp,
                    "event": e.event,
                    "model": e.model,
                    "vram_before_mb": e.vram_before_mb,
                    "vram_after_mb": e.vram_after_mb,
                    "detail": e.detail,
                }
                for e in manager._events
            ],
            "saved_at": time.time(),
        }
        settings.stats_file.write_text(json.dumps(data, indent=2))
        logger.info("Saved stats to %s", settings.stats_file)
    except Exception:
        logger.warning("Failed to save stats to %s", settings.stats_file, exc_info=True)


# -- Lifespan --------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Initialize GPU monitoring
    gpu.init()
    budget = _resolve_budget()
    manager = OnnxModelManager(vram_budget_mb=budget, data_dir=settings.data_dir)
    timeline = gpu.VramTimeline()

    # Register engine models
    engine_map = _build_engine_map()
    for engine in engine_map.values():
        manager.register_many(engine.get_models())

    # Load VRAM profile if available
    if settings.profile_file.exists():
        manager.load_profile(settings.profile_file)
        logger.info("Loaded VRAM profile from %s", settings.profile_file)

    # Restore per-model enabled/disabled state
    manager.load_model_state()

    if settings.warmup:
        logger.info("Warming up required models...")
        manager.warmup(required_only=True)
        logger.info("Warmup complete: %s", manager.stats())

    manager.start_idle_evictor(settings.idle_evict_minutes)
    timeline.start(model_count_fn=lambda: len(manager._models))

    # Create and mount router
    cortex = create_cortex_router(manager, engine_map, timeline=timeline)
    app.include_router(cortex.router)

    # Store on app.state for endpoint access
    app.state.manager = manager
    app.state.timeline = timeline
    app.state.cortex = cortex

    # Restore persisted stats
    _load_stats(cortex)

    yield

    # Shutdown
    _save_stats(cortex, manager)
    timeline.stop()
    logger.info("Shutting down, unloading all models...")
    manager.unload_all()
    gpu.shutdown()
    logger.info("Shutdown complete")


# -- App factory ------------------------------------------------------------


_AUTH_EXEMPT_PATHS = frozenset({"/health"})


class ApiKeyMiddleware(BaseHTTPMiddleware):
    """Reject requests without a valid X-API-Key header (except health)."""

    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        if request.url.path in _AUTH_EXEMPT_PATHS:
            return await call_next(request)
        key = request.headers.get("X-API-Key", "")
        if not hmac.compare_digest(key, settings.api_key):
            return JSONResponse({"error": "invalid api key"}, status_code=401)
        return await call_next(request)


def create_app() -> FastAPI:
    app = FastAPI(title="Toolii Cortex", version="0.1.0", lifespan=lifespan)

    if settings.api_key:
        app.add_middleware(ApiKeyMiddleware)
        logger.info("API key authentication enabled")
    else:
        logger.warning("SECURITY WARNING: CORTEX_API_KEY not set, all requests accepted")

    @app.get("/health")
    async def health(request: Request) -> dict:
        mgr: OnnxModelManager = request.app.state.manager
        cortex: CortexRouter = request.app.state.cortex
        tl: gpu.VramTimeline = request.app.state.timeline
        return {
            "status": "ok",
            "gpu": gpu.gpu_info_extended(),
            "models": mgr.stats(),
            "queue": cortex.queue_info(),
            "shared_memory_warning": tl.shared_memory_detected(),
            "uptime_seconds": int(time.time() - _start_time),
        }

    @app.get("/models")
    async def models_detail(request: Request) -> dict:
        """Detailed model registry, load status, VRAM usage, and GPU memory."""
        mgr: OnnxModelManager = request.app.state.manager
        cortex: CortexRouter = request.app.state.cortex
        detail = mgr.detailed_stats()
        detail["gpu"] = gpu.gpu_info_extended()
        detail["inference_stats"] = cortex.get_stats()
        detail["uptime_seconds"] = int(time.time() - _start_time)
        return detail

    @app.get("/models/check")
    async def models_check_all(request: Request) -> dict:
        """Validate all registered models (file existence + ONNX integrity)."""
        mgr: OnnxModelManager = request.app.state.manager
        result = mgr.check_all()
        result["gpu"] = gpu.gpu_info()
        return result

    @app.get("/models/{model_name}/check")
    async def model_check(model_name: str, request: Request) -> dict:
        """Validate a single model by name."""
        mgr: OnnxModelManager = request.app.state.manager
        return mgr.check_model(model_name)

    @app.get("/stats")
    async def stats(request: Request) -> dict:
        """Lightweight inference statistics and queue status."""
        cortex: CortexRouter = request.app.state.cortex
        return {
            "inference": cortex.get_stats(),
            "queue": cortex.queue_info(),
            "gpu": gpu.gpu_info_extended(),
            "uptime_seconds": int(time.time() - _start_time),
        }

    @app.post("/admin/unload-all")
    async def admin_unload_all(request: Request) -> dict:
        """Unload all models. Used by profile/test scripts."""
        mgr: OnnxModelManager = request.app.state.manager
        mgr.unload_all()
        return {"status": "ok", "vram_mb": gpu.vram_used_mb()}

    @app.post("/admin/unload/{model_name}")
    async def admin_unload_model(model_name: str, request: Request) -> dict:
        """Unload a single model to free VRAM."""
        mgr: OnnxModelManager = request.app.state.manager
        if model_name not in mgr._registry:
            return JSONResponse(
                {"error": {"code": "MODEL_NOT_FOUND",
                           "message": f"Unknown model: {model_name}"}},
                status_code=400,
            )
        if model_name not in mgr._models:
            return JSONResponse(
                {"error": {"code": "MODEL_NOT_LOADED",
                           "message": f"Model not loaded: {model_name}"}},
                status_code=400,
            )
        vram_before = gpu.vram_used_mb()
        mgr.unload(model_name)
        vram_freed = max(0, vram_before - gpu.vram_used_mb())
        return {"status": "ok", "model": model_name, "vram_freed_mb": vram_freed}

    @app.post("/admin/models/{model_name}/enable")
    async def admin_enable_model(model_name: str, request: Request) -> dict:
        """Re-enable a disabled model."""
        mgr: OnnxModelManager = request.app.state.manager
        result = mgr.enable_model(model_name)
        if result.get("error"):
            return JSONResponse(
                {"error": {"code": result["error"].upper(),
                           "message": result["error"]}},
                status_code=400,
            )
        return result

    @app.post("/admin/models/{model_name}/disable")
    async def admin_disable_model(model_name: str, request: Request) -> dict:
        """Disable a model (unloads if loaded, rejects future requests)."""
        mgr: OnnxModelManager = request.app.state.manager
        result = mgr.disable_model(model_name)
        if result.get("error"):
            status = 409 if result["error"] == "cannot_disable_required" else 400
            return JSONResponse(
                {"error": {"code": result["error"].upper(),
                           "message": result["error"]}},
                status_code=status,
            )
        return result

    @app.post("/admin/save-profile")
    async def admin_save_profile(request: Request) -> dict:
        """Save VRAM profile data. Used by test/profile scripts."""
        mgr: OnnxModelManager = request.app.state.manager
        body = await request.json()
        path = settings.profile_file
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(body, indent=2) + "\n")
            mgr.load_profile(path)
            return {"status": "ok", "path": str(path), "models": len(body)}
        except Exception as exc:
            return {"status": "error", "message": str(exc)}

    @app.get("/stats/timeline")
    async def stats_timeline(request: Request, last: int = 300) -> dict:
        """Recent VRAM timeline samples (default: last 5 minutes)."""
        tl: gpu.VramTimeline = request.app.state.timeline
        return {
            "samples": tl.get_samples(last_n=last),
            "shared_memory_detected": tl.shared_memory_detected(),
        }

    return app


app = create_app()
