from __future__ import annotations

import contextlib
import logging
import os
import sys
import threading
from collections.abc import AsyncIterator

# Suppress noisy C++ logs from MediaPipe / TensorFlow Lite
os.environ.setdefault("GLOG_minloglevel", "2")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")


@contextlib.contextmanager
def _suppress_native_stderr():
    """Redirect OS-level fd 2 to /dev/null to silence C++ library output."""
    stderr_fd = sys.stderr.fileno()
    saved_fd = os.dup(stderr_fd)
    try:
        devnull = os.open(os.devnull, os.O_WRONLY)
        os.dup2(devnull, stderr_fd)
        os.close(devnull)
        yield
    finally:
        os.dup2(saved_fd, stderr_fd)
        os.close(saved_fd)


from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.logging_config import setup_logging

setup_logging(
    level="DEBUG" if settings.env == "dev" else "INFO",
    json_output=settings.env != "dev",
)

from app.core.error_handlers import register_error_handlers
from app.core.rate_limiter import limiter, register_rate_limiter
from app.core.security_headers import RequestSizeLimitMiddleware, SecurityHeadersMiddleware
from app.core.database import SessionLocal
from app.core.scheduler import scheduler, setup_scheduler
from app.core.token_blacklist import token_blacklist

from app.processing.background_removal import prewarm_background_models
from app.processing.face_detection import prewarm_face_landmarker
from app.processing.face_similarity import prewarm_facenet
from app.routers import auth, credits, docx, download, face_reading, feedback, history, hub, image, pdf, photo, share, tools, users
from app.routers.admin import router as admin_router
from app.routers.hub import hub_og_router
from app.routers.result_share import router as result_share_router, og_router as result_share_og_router
from app.services import cortex_client, llm_client

logger = logging.getLogger(__name__)


@contextlib.asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Pre-warm ML models in a background thread so startup is not blocked
    def _prewarm_models() -> None:
        with _suppress_native_stderr():
            prewarm_background_models(["silueta"])
            prewarm_face_landmarker()
            prewarm_facenet()
        logger.info("Local fallback models loaded")

    threading.Thread(target=_prewarm_models, name="model-prewarm", daemon=True).start()

    # Cortex GPU service connectivity check
    try:
        health_resp = await cortex_client.health_check()
        logger.info("Cortex GPU service connected: %s", health_resp.get("status"))
    except Exception:
        logger.warning("Cortex GPU service not available, will use local fallback models")

    async with SessionLocal() as db:
        await token_blacklist.load_cache(db)
    setup_scheduler(scheduler)
    scheduler.start()

    yield

    await cortex_client.close()
    await llm_client.close()
    if scheduler.running:
        scheduler.shutdown(wait=False)


def create_app() -> FastAPI:
    docs_enabled = settings.env == "dev"
    app = FastAPI(
        title=settings.project_name,
        lifespan=_lifespan,
        docs_url="/docs" if docs_enabled else None,
        redoc_url="/redoc" if docs_enabled else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "Accept", "Accept-Language"],
    )
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RequestSizeLimitMiddleware)

    app.state.limiter = limiter
    register_rate_limiter(app)
    register_error_handlers(app)

    app.include_router(auth.router)
    app.include_router(users.router)
    app.include_router(credits.router)
    app.include_router(share.router)
    app.include_router(photo.router)
    app.include_router(photo.router_public)
    app.include_router(image.router)
    app.include_router(pdf.router)
    app.include_router(docx.router)
    app.include_router(download.router)
    app.include_router(history.router)
    app.include_router(face_reading.router)
    app.include_router(result_share_router)
    app.include_router(result_share_og_router)
    app.include_router(feedback.router)
    app.include_router(tools.router)
    app.include_router(hub.router)
    app.include_router(hub_og_router)
    app.include_router(admin_router)

    @app.get(f"{settings.api_prefix}/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
