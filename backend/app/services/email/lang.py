from __future__ import annotations

from typing import Literal

Lang = Literal["zh", "en"]


def parse_lang(accept_language: str | None) -> Lang:
    """Normalize Accept-Language header value to 'zh' or 'en'.

    Supports values like 'zh-CN', 'zh', 'en', 'en-US'. Defaults to 'zh'.
    """
    if not accept_language:
        return "zh"
    tag = accept_language.split(",")[0].strip().split(";")[0].strip().lower()
    if tag.startswith("en"):
        return "en"
    return "zh"
