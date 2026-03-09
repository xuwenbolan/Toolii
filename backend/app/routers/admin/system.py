from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, Path, Query, Request
from slowapi.util import get_remote_address

from app.core.audit_log import audit
from app.core.dependencies import get_admin_user
from app.core.rate_limiter import admin_write_rate_limit, limiter
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
    model_name: str = Path(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_.-]*$"),
    admin: User = Depends(get_admin_user),  # noqa: ARG001
) -> dict[str, Any]:
    """Validate a single Cortex model."""
    try:
        return await cortex_client.model_check(model_name)
    except Exception:
        logger.warning("Cortex unavailable for model check: %s", model_name, exc_info=True)
        return {"name": model_name, "healthy": False, "error": "cortex_unavailable"}


@router.post("/cortex/unload-all")
@limiter.limit(admin_write_rate_limit)
async def cortex_unload_all(
    request: Request,
    admin: User = Depends(get_admin_user),
) -> dict[str, Any]:
    """Unload all Cortex models to free VRAM."""
    try:
        result = await cortex_client.unload_all()
        await audit(
            category="admin",
            action="cortex_unload_all",
            user_id=admin.id,
            ip=get_remote_address(request),
        )
        return result
    except Exception:
        logger.warning("Cortex unavailable for unload-all", exc_info=True)
        return {"status": "error", "error": "cortex_unavailable"}


@router.post("/cortex/models/{model_name}/unload")
@limiter.limit(admin_write_rate_limit)
async def cortex_unload_model(
    request: Request,
    model_name: str = Path(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_.-]*$"),
    admin: User = Depends(get_admin_user),
) -> dict[str, Any]:
    """Unload a single Cortex model to free VRAM."""
    try:
        result = await cortex_client.unload_model(model_name)
        await audit(
            category="admin",
            action="cortex_unload_model",
            user_id=admin.id,
            ip=get_remote_address(request),
            detail=model_name,
        )
        return result
    except Exception:
        logger.warning("Cortex unavailable for unload: %s", model_name, exc_info=True)
        return {"status": "error", "error": "cortex_unavailable"}


@router.post("/cortex/models/{model_name}/enable")
@limiter.limit(admin_write_rate_limit)
async def cortex_enable_model(
    request: Request,
    model_name: str = Path(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_.-]*$"),
    admin: User = Depends(get_admin_user),
) -> dict[str, Any]:
    """Re-enable a disabled Cortex model."""
    try:
        result = await cortex_client.enable_model(model_name)
        await audit(
            category="admin",
            action="cortex_enable_model",
            user_id=admin.id,
            ip=get_remote_address(request),
            detail=model_name,
        )
        return result
    except Exception:
        logger.warning("Cortex unavailable for enable: %s", model_name, exc_info=True)
        return {"status": "error", "error": "cortex_unavailable"}


@router.post("/cortex/models/{model_name}/disable")
@limiter.limit(admin_write_rate_limit)
async def cortex_disable_model(
    request: Request,
    model_name: str = Path(pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_.-]*$"),
    admin: User = Depends(get_admin_user),
) -> dict[str, Any]:
    """Disable a Cortex model (unloads + rejects future requests)."""
    try:
        result = await cortex_client.disable_model(model_name)
        await audit(
            category="admin",
            action="cortex_disable_model",
            user_id=admin.id,
            ip=get_remote_address(request),
            detail=model_name,
        )
        return result
    except Exception:
        logger.warning("Cortex unavailable for disable: %s", model_name, exc_info=True)
        return {"status": "error", "error": "cortex_unavailable"}


@router.get("/cortex/timeline")
async def cortex_timeline(
    last: int = Query(default=300, ge=1, le=3600),
    admin: User = Depends(get_admin_user),  # noqa: ARG001
) -> dict[str, Any]:
    """Fetch recent VRAM timeline samples from Cortex."""
    try:
        return await cortex_client.fetch_timeline(last)
    except Exception:
        logger.warning("Cortex unavailable for timeline", exc_info=True)
        return {"samples": [], "shared_memory_detected": False}
