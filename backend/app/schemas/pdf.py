from __future__ import annotations

from enum import Enum

from app.schemas.common import FileResult

__all__ = ["FileResult", "PdfPagesOperation"]


class PdfPagesOperation(str, Enum):
    rotate = "rotate"
    delete = "delete"
    extract = "extract"
    reorder = "reorder"
