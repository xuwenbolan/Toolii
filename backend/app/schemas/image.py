from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from app.schemas.common import FileResult

__all__ = ["FileResult", "OcrLine", "OcrResult", "SegmentMask", "SegmentResult"]


class OcrLine(BaseModel):
    text: str
    score: float
    box: list[list[float]]


class OcrResult(BaseModel):
    lines: list[OcrLine]
    full_text: str
    meta: dict[str, Any] | None = None


class SegmentMask(BaseModel):
    mask_b64: str
    score: float
    low_res_mask_b64: str | None = None


class SegmentResult(BaseModel):
    masks: list[SegmentMask]
    meta: dict[str, Any] | None = None
