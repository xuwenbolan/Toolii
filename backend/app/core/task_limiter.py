from __future__ import annotations

import asyncio

from fastapi import Request

from app.core.config import settings
from app.core.rate_limiter import rate_limit_key


_semaphores: dict[str, asyncio.Semaphore] = {}
_lock = asyncio.Lock()


async def acquire_task_slot(request: Request) -> asyncio.Semaphore:
    key = rate_limit_key(request)
    async with _lock:
        sem = _semaphores.get(key)
        if sem is None:
            sem = asyncio.Semaphore(settings.max_concurrent_tasks_per_key)
            _semaphores[key] = sem
    await sem.acquire()
    return sem

