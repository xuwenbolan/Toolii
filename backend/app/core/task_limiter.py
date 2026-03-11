from __future__ import annotations

import asyncio
from collections import OrderedDict
from contextlib import asynccontextmanager
from collections.abc import AsyncIterator

from fastapi import Request

from app.core.config import settings
from app.core.rate_limiter import rate_limit_key

_MAX_KEYS = 4096
_semaphores: OrderedDict[str, asyncio.Semaphore] = OrderedDict()
_lock = asyncio.Lock()


async def acquire_task_slot(request: Request) -> asyncio.Semaphore:
    key = rate_limit_key(request)
    async with _lock:
        sem = _semaphores.get(key)
        if sem is None:
            if len(_semaphores) >= _MAX_KEYS:
                _semaphores.popitem(last=False)
            sem = asyncio.Semaphore(settings.max_concurrent_tasks_per_key)
            _semaphores[key] = sem
        else:
            _semaphores.move_to_end(key)
    await sem.acquire()
    return sem


@asynccontextmanager
async def task_slot(request: Request) -> AsyncIterator[None]:
    """Async context manager that acquires and releases a task slot."""
    sem = await acquire_task_slot(request)
    try:
        yield
    finally:
        sem.release()
