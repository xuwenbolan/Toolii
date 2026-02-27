from __future__ import annotations

import io


def merge_pdfs(pdf_files: list[bytes]) -> bytes:
    if not pdf_files:
        raise ValueError("No PDF files provided")

    from PyPDF2 import PdfReader, PdfWriter

    writer = PdfWriter()

    for data in pdf_files:
        reader = PdfReader(io.BytesIO(data))
        for page in reader.pages:
            writer.add_page(page)

    if len(writer.pages) == 0:
        raise ValueError("No pages found")

    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()

