from __future__ import annotations

from pydantic import BaseModel


class FileResult(BaseModel):
    file_id: str
    filename: str
    size: int
    content_type: str
    download_url: str
    expires_in: int


class OcrLine(BaseModel):
    text: str
    score: float
    box: list[list[float]]


class OcrResult(BaseModel):
    engine: str
    lang: str
    width: int
    height: int
    lines: list[OcrLine]
    full_text: str


class SegmentResult(BaseModel):
    mask_b64: str
    score: float
    width: int
    height: int
