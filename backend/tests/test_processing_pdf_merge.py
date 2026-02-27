from __future__ import annotations

import io

import pytest
from PyPDF2 import PdfReader, PdfWriter

from app.processing.pdf_merge import merge_pdfs


def _pdf_with_pages(count: int) -> bytes:
    writer = PdfWriter()
    for _ in range(count):
        writer.add_blank_page(width=300, height=400)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def test_merge_pdfs_combines_all_pages() -> None:
    merged = merge_pdfs([_pdf_with_pages(1), _pdf_with_pages(2)])
    reader = PdfReader(io.BytesIO(merged))
    assert len(reader.pages) == 3


def test_merge_pdfs_requires_input() -> None:
    with pytest.raises(ValueError):
        merge_pdfs([])
