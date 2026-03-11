"""Async utilities: run blocking functions in a dedicated I/O thread pool."""

from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from typing import Any, TypeVar

T = TypeVar("T")

# Dedicated pool for file/image I/O so we don't saturate the default executor
_io_pool = ThreadPoolExecutor(max_workers=20, thread_name_prefix="io-pool")


async def run_sync(fn: Any, *args: Any, **kwargs: Any) -> T:
    """Run a blocking function in the dedicated I/O thread pool.

    Usage::

        out, mime = await run_sync(compress_image, image_bytes, quality=80)
    """
    loop = asyncio.get_running_loop()
    call = partial(fn, *args, **kwargs) if kwargs else partial(fn, *args)
    return await loop.run_in_executor(_io_pool, call)
