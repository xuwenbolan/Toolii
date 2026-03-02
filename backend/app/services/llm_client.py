"""Generic LLM client supporting OpenAI-compatible APIs.

Uses httpx directly (no SDK dependency). Supports any service that implements
the OpenAI chat completions format: OpenAI, DeepSeek, vLLM, Ollama, etc.

When LLM_BASE_URL or LLM_API_KEY is empty, the client is disabled and
generate() returns an empty string (callers should fall back to templates).
"""

from __future__ import annotations

import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient | None:
    """Lazily create the httpx client singleton."""
    global _client  # noqa: PLW0603

    if not settings.llm_base_url or not settings.llm_api_key:
        return None

    if _client is None:
        _client = httpx.AsyncClient(
            base_url=settings.llm_base_url.rstrip("/"),
            headers={
                "Authorization": f"Bearer {settings.llm_api_key}",
                "Content-Type": "application/json",
            },
            timeout=httpx.Timeout(connect=10.0, read=120.0, write=10.0, pool=10.0),
        )
    return _client


async def generate(
    *,
    system_prompt: str,
    user_prompt: str,
    max_tokens: int = 2000,
    temperature: float = 0.7,
) -> str:
    """Generate text via OpenAI-compatible chat completions API.

    Returns the generated text, or empty string if LLM is disabled or fails.
    """
    client = _get_client()
    if client is None:
        return ""

    model = settings.llm_model
    if not model:
        return ""

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }

    try:
        resp = await client.post("/v1/chat/completions", json=payload)
        resp.raise_for_status()
        data = resp.json()
        choices = data.get("choices", [])
        if choices:
            return choices[0].get("message", {}).get("content", "")
        return ""
    except (httpx.HTTPError, KeyError, IndexError, ValueError):
        logger.warning("LLM generation failed", exc_info=True)
        return ""


async def close() -> None:
    """Close the httpx client (call on app shutdown)."""
    global _client  # noqa: PLW0603
    if _client is not None:
        await _client.aclose()
        _client = None
