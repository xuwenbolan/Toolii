from __future__ import annotations

import io


def _compress_with_pikepdf(pdf_bytes: bytes) -> bytes:
    try:
        import pikepdf
    except ImportError as exc:
        raise RuntimeError("pikepdf is not available") from exc

    with pikepdf.Pdf.open(io.BytesIO(pdf_bytes)) as pdf:
        out = io.BytesIO()
        save_kwargs: dict[str, object] = {
            "compress_streams": True,
        }
        if hasattr(pikepdf, "ObjectStreamMode"):
            save_kwargs["object_stream_mode"] = pikepdf.ObjectStreamMode.generate

        try:
            pdf.save(out, **save_kwargs)
        except TypeError:
            pdf.save(out)
        return out.getvalue()


def _compress_with_pypdf2(pdf_bytes: bytes) -> bytes:
    from PyPDF2 import PdfReader, PdfWriter

    reader = PdfReader(io.BytesIO(pdf_bytes))
    writer = PdfWriter()

    for page in reader.pages:
        try:
            page.compress_content_streams()
        except (ValueError, KeyError, RuntimeError, TypeError):
            pass
        writer.add_page(page)

    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def compress_pdf(pdf_bytes: bytes, *, target_kb: int | None = None) -> bytes:  # noqa: ARG001
    candidates = [pdf_bytes]

    for compressor in (_compress_with_pikepdf, _compress_with_pypdf2):
        try:
            compressed = compressor(pdf_bytes)
        except (ImportError, RuntimeError, ValueError, OSError):
            continue
        if compressed:
            candidates.append(compressed)

    if len(candidates) == 1:
        raise ValueError("Unable to compress PDF")

    return min(candidates, key=len)
