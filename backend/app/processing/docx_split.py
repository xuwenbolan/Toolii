"""DOCX document splitting by heading level."""

from __future__ import annotations

import io
import logging
import re
import zipfile

from docx import Document
from docx.oxml.ns import qn

logger = logging.getLogger(__name__)

_HEADING_RE = re.compile(r"^Heading\s+(\d+)$", re.IGNORECASE)
_SAFE_FILENAME_RE = re.compile(r'[\\/*?:"<>|]')


def split_docx(docx_bytes: bytes, split_level: int = 1) -> bytes:
    """Split DOCX at specified heading level boundaries. Returns ZIP bytes.

    Each section starts at a heading of the given level and includes all
    content until the next heading of the same level (or end of document).
    Images, hyperlinks, styles, numbering, headers and footers are all
    preserved in each section via a full-document clone + body trim.
    """
    if split_level < 1 or split_level > 6:
        raise ValueError(f"split_level must be 1-6, got {split_level}")

    doc = Document(io.BytesIO(docx_bytes))
    body = doc.element.body
    children = list(body)

    split_indices: list[int] = []
    heading_texts: list[str] = []

    for i, child in enumerate(children):
        if child.tag != qn("w:p"):
            continue
        p_style = child.find(f".//{qn('w:pStyle')}")
        if p_style is None:
            continue
        style_val = p_style.get(qn("w:val")) or ""
        m = _HEADING_RE.match(style_val)
        if m and int(m.group(1)) == split_level:
            split_indices.append(i)
            texts = [t.text or "" for t in child.iter(qn("w:t"))]
            heading_texts.append("".join(texts).strip() or f"Section {len(split_indices)}")

    if not split_indices:
        logger.info("No H%d headings found, returning original document", split_level)
        return _pack_single_zip(docx_bytes, "document.docx")

    segments: list[tuple[int, int, str]] = []

    if split_indices[0] > 0:
        segments.append((0, split_indices[0], "00_preamble"))

    for j, idx in enumerate(split_indices):
        end = split_indices[j + 1] if j + 1 < len(split_indices) else len(children)
        name = _safe_filename(j + 1, heading_texts[j])
        segments.append((idx, end, name))

    logger.info("Splitting into %d segments at H%d", len(segments), split_level)

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for start, end, name in segments:
            section_bytes = _build_section_doc(docx_bytes, start, end)
            zf.writestr(f"{name}.docx", section_bytes)

    return zip_buf.getvalue()


def _build_section_doc(docx_bytes: bytes, start: int, end: int) -> bytes:
    """Build a section DOCX by cloning the source and trimming body children
    outside the ``[start, end)`` index range.

    Starting from a full copy guarantees that every relationship in the
    package (image parts, hyperlink targets, styles, numbering, headers,
    footers, settings, fonts, theme) survives intact. Unreferenced image
    parts would linger but are harmless; the previous approach of
    manually re-parenting w:body elements broke the document because
    relationships in ``document.xml.rels`` were not carried over.
    """
    doc = Document(io.BytesIO(docx_bytes))
    body = doc.element.body
    children = list(body)

    # The trailing w:sectPr (document-level section properties) must be
    # preserved regardless of the segment range, otherwise the resulting
    # DOCX has no page geometry.
    trailing_sect_pr = None
    if children and children[-1].tag == qn("w:sectPr"):
        trailing_sect_pr = children[-1]

    for i, child in enumerate(children):
        if child is trailing_sect_pr:
            continue
        if start <= i < end:
            continue
        body.remove(child)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _safe_filename(index: int, heading_text: str) -> str:
    """Generate a safe filename from heading text."""
    clean = _SAFE_FILENAME_RE.sub("", heading_text).strip()
    clean = clean[:50].rstrip(". ")
    if not clean:
        clean = f"section-{index}"
    return f"{index:02d}_{clean}"


def _pack_single_zip(docx_bytes: bytes, name: str) -> bytes:
    """Pack a single DOCX into a ZIP archive."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(name, docx_bytes)
    return buf.getvalue()
