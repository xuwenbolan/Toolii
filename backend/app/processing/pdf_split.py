from __future__ import annotations

import io
import re
import zipfile


def _parse_ranges(range_str: str, total_pages: int) -> list[list[int]]:
    """Parse range string like "1-3,5,7-9" into segments of 0-indexed page lists."""
    segments: list[list[int]] = []
    for part in range_str.split(","):
        part = part.strip()
        if not part:
            continue
        m = re.fullmatch(r"(\d+)-(\d+)", part)
        if m:
            start, end = int(m.group(1)), int(m.group(2))
            if start < 1 or end > total_pages or start > end:
                raise ValueError(f"Invalid range: {part}")
            segments.append(list(range(start - 1, end)))
        elif re.fullmatch(r"\d+", part):
            page = int(part)
            if page < 1 or page > total_pages:
                raise ValueError(f"Invalid page: {part}")
            segments.append([page - 1])
        else:
            raise ValueError(f"Invalid range format: {part}")
    return segments


def split_pdf(pdf_bytes: bytes, *, ranges: str) -> bytes:
    """Split PDF by page ranges, return ZIP archive of split PDFs.

    Each comma-separated segment produces one output PDF.
    Pages are 1-based in the input string.
    """
    from PyPDF2 import PdfReader, PdfWriter

    reader = PdfReader(io.BytesIO(pdf_bytes))
    total_pages = len(reader.pages)
    if total_pages == 0:
        raise ValueError("PDF has no pages")

    segments = _parse_ranges(ranges, total_pages)
    if not segments:
        raise ValueError("No valid ranges provided")
    if len(segments) > 50:
        raise ValueError("Too many segments (max 50)")

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for i, page_indices in enumerate(segments, start=1):
            writer = PdfWriter()
            for idx in page_indices:
                writer.add_page(reader.pages[idx])
            part_buf = io.BytesIO()
            writer.write(part_buf)

            if len(page_indices) == 1:
                name = f"part-{i}_p{page_indices[0] + 1}.pdf"
            else:
                name = f"part-{i}_p{page_indices[0] + 1}-{page_indices[-1] + 1}.pdf"
            zf.writestr(name, part_buf.getvalue())

    return zip_buf.getvalue()
