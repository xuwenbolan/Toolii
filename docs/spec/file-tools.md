# Module 3: File / PDF Tools (Free Acquisition Features)

Status: draft | Updated: 2026-03-03

All file tools are free, no login required. Rate-limited to prevent abuse.

---

## Feature Set

| Feature | Description | Tech | Priority |
|---------|-------------|------|----------|
| PDF compress | Reduce PDF file size, support target size (e.g. 2MB/5MB) | pikepdf / PyPDF2 | P0 |
| PDF merge | Combine multiple PDFs into one | pikepdf / PyPDF2 | P0 |
| PDF page tools | Rotate / delete / extract / reorder pages (higher frequency than merge/compress) | pikepdf | P0 |
| PDF split | Split PDF by page | pikepdf / PyPDF2 | P1 |
| Image to PDF | Combine multiple images into PDF | Pillow + reportlab | P0 |
| Word tools | Unified Word workspace: health check, auto-repair, merge, split, compress, convert to PDF | python-docx + LibreOffice headless; see [docx-tools.md](tools/docx-tools.md) | P1 |

---

## Processing Notes

- All file tools run on CPU (Backend local processing). No GPU / Cortex dependency.
- Single file size limit: 50 MB (PDF and DOCX).
- Word tools require LibreOffice headless for PDF conversion.
