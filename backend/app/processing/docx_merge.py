"""DOCX multi-document merge via docxcompose."""

from __future__ import annotations

import io

from docx import Document
from docxcompose.composer import Composer


def merge_docx(docx_files: list[bytes]) -> bytes:
    """Merge multiple DOCX documents into one.

    The first document is the master (its styles take precedence).
    Subsequent documents are appended with section breaks.
    docxcompose handles style/numbering conflict resolution.
    """
    if len(docx_files) < 2:
        raise ValueError("At least 2 documents required for merge")

    master = Document(io.BytesIO(docx_files[0]))
    composer = Composer(master)

    for data in docx_files[1:]:
        doc = Document(io.BytesIO(data))
        composer.append(doc)

    buf = io.BytesIO()
    composer.save(buf)
    return buf.getvalue()
