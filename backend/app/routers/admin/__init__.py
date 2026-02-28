from __future__ import annotations

from fastapi import APIRouter

from app.core.config import settings
from app.routers.admin.cards import router as cards_router
from app.routers.admin.dashboard import router as dashboard_router
from app.routers.admin.feedback import router as feedback_router
from app.routers.admin.operations import router as operations_router
from app.routers.admin.users import router as users_router

router = APIRouter(prefix=f"{settings.api_prefix}/admin")

router.include_router(dashboard_router)
router.include_router(users_router)
router.include_router(cards_router)
router.include_router(operations_router)
router.include_router(feedback_router)
