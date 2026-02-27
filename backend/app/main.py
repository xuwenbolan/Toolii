from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.error_handlers import register_error_handlers
from app.core.rate_limiter import limiter, register_rate_limiter
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
