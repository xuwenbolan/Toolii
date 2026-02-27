"""Integration tests for PdfService (compress, merge, pages, from_images)."""

from __future__ import annotations

import io

import pytest
from PyPDF2 import PdfWriter

from app.services.pdf_service import PdfService


def _make_pdf(pages: int = 1) -> bytes:
    """Generate a minimal valid PDF with the given number of pages."""
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=612, height=792)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


@pytest.fixture()
def pdf_service(tmp_path, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "file_storage_dir", str(tmp_path / "files"))
    return PdfService()


@pytest.fixture()
def single_page_pdf():
    return _make_pdf(1)


@pytest.fixture()
def multi_page_pdf():
    return _make_pdf(5)


@pytest.mark.asyncio
async def test_compress_returns_pdf(pdf_service, single_page_pdf):
    result = await pdf_service.compress(
        pdf_bytes=single_page_pdf,
        filename="doc.pdf",
        target_kb=None,
    )
    assert result.file_id
    assert result.content_type == "application/pdf"
    assert "compressed" in result.filename


@pytest.mark.asyncio
async def test_merge_combines_two_pdfs(pdf_service):
    pdf1 = _make_pdf(2)
    pdf2 = _make_pdf(3)
    result = await pdf_service.merge(pdf_files=[("a.pdf", pdf1), ("b.pdf", pdf2)])
    assert result.file_id
    assert result.content_type == "application/pdf"
    assert "merged" in result.filename


@pytest.mark.asyncio
async def test_merge_rejects_single_file(pdf_service, single_page_pdf):
    from app.core.exceptions import AppError

    with pytest.raises(AppError) as exc_info:
        await pdf_service.merge(pdf_files=[("a.pdf", single_page_pdf)])
    assert exc_info.value.code == "INVALID_FILES"


@pytest.mark.asyncio
async def test_pages_extract(pdf_service, multi_page_pdf):
    result = await pdf_service.pages(
        pdf_bytes=multi_page_pdf,
        filename="doc.pdf",
        operation="extract",
        pages=[1, 3],
        order=None,
        rotation=90,
    )
    assert result.file_id
    assert result.content_type == "application/pdf"


@pytest.mark.asyncio
async def test_pages_rotate(pdf_service, multi_page_pdf):
    result = await pdf_service.pages(
        pdf_bytes=multi_page_pdf,
        filename="doc.pdf",
        operation="rotate",
        pages=[1, 2],
        order=None,
        rotation=90,
    )
    assert result.file_id
    assert result.content_type == "application/pdf"


@pytest.mark.asyncio
async def test_pages_delete(pdf_service, multi_page_pdf):
    result = await pdf_service.pages(
        pdf_bytes=multi_page_pdf,
        filename="doc.pdf",
        operation="delete",
        pages=[2, 4],
        order=None,
        rotation=90,
    )
    assert result.file_id


@pytest.mark.asyncio
async def test_from_images(pdf_service):
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (100, 100), color="red").save(buf, format="JPEG")
    img1 = buf.getvalue()

    buf2 = io.BytesIO()
    Image.new("RGB", (100, 100), color="blue").save(buf2, format="JPEG")
    img2 = buf2.getvalue()

    result = await pdf_service.from_images(
        image_files=[("img1.jpg", img1), ("img2.jpg", img2)],
        dpi=150,
    )
    assert result.file_id
    assert result.content_type == "application/pdf"


@pytest.mark.asyncio
async def test_from_images_rejects_empty(pdf_service):
    from app.core.exceptions import AppError

    with pytest.raises(AppError) as exc_info:
        await pdf_service.from_images(image_files=[], dpi=150)
    assert exc_info.value.code == "INVALID_FILES"
