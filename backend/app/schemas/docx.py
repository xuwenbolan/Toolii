from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from app.schemas.common import FileResult


class DocxIssue(BaseModel):
    code: str  # e.g. "REDUNDANT_EMPTY_PARAGRAPHS"
    severity: str  # "critical" | "warning" | "info"
    message: str
    count: int = 1
    fixable: bool = True  # whether auto-repair is available for this issue
    params: dict[str, Any] | None = None


class DocxMetadata(BaseModel):
    word_count: int
    paragraph_count: int
    heading_count: int
    image_count: int
    font_families: list[str]
    style_count: int
    page_count_estimate: int


class DocxHeadingItem(BaseModel):
    level: int  # 1-9
    text: str
    has_issue: bool = False
    issue_code: str | None = None


class DocxAnalysisResult(BaseModel):
    metadata: DocxMetadata
    headings: list[DocxHeadingItem]
    issues: list[DocxIssue]
    score: int  # 0-100 health score


__all__ = ["DocxAnalysisResult", "DocxHeadingItem", "DocxIssue", "DocxMetadata", "FileResult"]
