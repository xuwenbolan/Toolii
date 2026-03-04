from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends

from app.core.dependencies import get_admin_user
from app.models.user import User
from app.services import cortex_client

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/system", tags=["admin-system"])


@router.get("/cortex/status")
async def cortex_status(
    admin: User = Depends(get_admin_user),  # noqa: ARG001
) -> dict[str, Any]:
    """Combined Cortex health + model status."""
    try:
        health = await cortex_client.health_check()
        models = await cortex_client.models_status()
        return {"online": True, "health": health, "models": models}
    except Exception:
        logger.warning("Cortex unavailable", exc_info=True)
        return {"online": False, "health": None, "models": None}


@router.get("/cortex/models/check")
async def cortex_models_check(
    admin: User = Depends(get_admin_user),  # noqa: ARG001
) -> dict[str, Any]:
    """Validate all Cortex models."""
    try:
        return await cortex_client.models_check_all()
    except Exception:
        logger.warning("Cortex unavailable for model check", exc_info=True)
        return {"healthy": False, "error": "cortex_unavailable"}


@router.get("/cortex/models/{model_name}/check")
async def cortex_model_check(
    model_name: str,
    admin: User = Depends(get_admin_user),  # noqa: ARG001
) -> dict[str, Any]:
    """Validate a single Cortex model."""
    try:
        return await cortex_client.model_check(model_name)
    except Exception:
        logger.warning("Cortex unavailable for model check: %s", model_name, exc_info=True)
        return {"name": model_name, "healthy": False, "error": "cortex_unavailable"}


@router.post("/cortex/unload-all")
async def cortex_unload_all(
    admin: User = Depends(get_admin_user),  # noqa: ARG001
) -> dict[str, Any]:
    """Unload all Cortex models to free VRAM."""
    try:
        return await cortex_client.unload_all()
    except Exception:
        logger.warning("Cortex unavailable for unload-all", exc_info=True)
        return {"status": "error", "error": "cortex_unavailable"}


@router.get("/cortex/timeline")
async def cortex_timeline(
    last: int = 300,
    admin: User = Depends(get_admin_user),  # noqa: ARG001
) -> dict[str, Any]:
    """Fetch recent VRAM timeline samples from Cortex."""
    try:
        return await cortex_client.fetch_timeline(last)
    except Exception:
        logger.warning("Cortex unavailable for timeline", exc_info=True)
        return {"samples": [], "shared_memory_detected": False}
