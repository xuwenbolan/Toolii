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
| Word to PDF | docx to PDF conversion | Server-side engine, compatibility requires polish | P2 |

---

## Processing Notes

- All PDF tools run on CPU (Backend local processing). No GPU / Cortex dependency.
- Single PDF file size limit: 50MB.
- Word to PDF has compatibility challenges; defer to mature engine/service post-MVP.
