from __future__ import annotations

import contextlib
import os
import sys

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
from app.core.error_handlers import register_error_handlers
from app.core.rate_limiter import limiter, register_rate_limiter
from app.core.security_headers import RequestSizeLimitMiddleware, SecurityHeadersMiddleware
from app.core.scheduler import scheduler, setup_scheduler
from app.processing.background_removal import prewarm_background_models
from app.processing.face_detection import prewarm_face_landmarker
from app.routers import auth, credits, download, image, pdf, photo, share, users


def create_app() -> FastAPI:
    app = FastAPI(title=settings.project_name)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
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
    app.include_router(image.router)
    app.include_router(pdf.router)
    app.include_router(download.router)

    @app.get(f"{settings.api_prefix}/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.on_event("startup")
    async def _startup() -> None:
        with _suppress_native_stderr():
            prewarm_background_models(["silueta", "u2net_human_seg"])
            prewarm_face_landmarker()
        setup_scheduler(scheduler)
        scheduler.start()

    @app.on_event("shutdown")
    async def _shutdown() -> None:
        if scheduler.running:
            scheduler.shutdown(wait=False)

    return app


app = create_app()
