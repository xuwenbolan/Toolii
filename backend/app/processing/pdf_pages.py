from __future__ import annotations

import io
from typing import Any, Literal


PdfPagesOperation = Literal["rotate", "delete", "extract", "reorder"]


def _normalize_pages(total_pages: int, pages: list[int] | None) -> list[int]:
    if pages is None:
        return []

    normalized: list[int] = []
    for page in pages:
        if page < 1 or page > total_pages:
            raise ValueError(f"Invalid page number: {page}")
        normalized.append(page - 1)
    return normalized


def _rotate_page(page: Any, angle: int) -> Any:
    if hasattr(page, "rotate"):
        return page.rotate(angle)

    if angle % 360 == 0:
        return page

    if angle > 0 and hasattr(page, "rotate_clockwise"):
        turns = (angle % 360) // 90
        for _ in range(turns):
            page = page.rotate_clockwise(90)
        return page

    raise ValueError("Page rotation is not supported")


def edit_pdf_pages(
    pdf_bytes: bytes,
    *,
    operation: PdfPagesOperation,
    pages: list[int] | None = None,
    order: list[int] | None = None,
    rotation: int = 90,
) -> bytes:
    from PyPDF2 import PdfReader, PdfWriter

    reader = PdfReader(io.BytesIO(pdf_bytes))
    total_pages = len(reader.pages)
    if total_pages == 0:
        raise ValueError("PDF has no pages")

    selected = _normalize_pages(total_pages, pages)
    reorder_list = _normalize_pages(total_pages, order) if order is not None else None

    writer = PdfWriter()

    if operation == "rotate":
        if rotation % 90 != 0:
            raise ValueError("rotation must be a multiple of 90")
        selected_set = set(selected or list(range(total_pages)))
        for idx, page in enumerate(reader.pages):
            if idx in selected_set:
                page = _rotate_page(page, rotation)
            writer.add_page(page)

    elif operation == "delete":
        if not selected:
            raise ValueError("pages is required for delete")
        selected_set = set(selected)
        for idx, page in enumerate(reader.pages):
            if idx not in selected_set:
                writer.add_page(page)
        if len(writer.pages) == 0:
            raise ValueError("Delete operation removed all pages")

    elif operation == "extract":
        if not selected:
            raise ValueError("pages is required for extract")
        for idx in selected:
            writer.add_page(reader.pages[idx])

    elif operation == "reorder":
        if not reorder_list:
            raise ValueError("order is required for reorder")
        for idx in reorder_list:
            writer.add_page(reader.pages[idx])

    else:
        raise ValueError("Unsupported operation")

    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()

