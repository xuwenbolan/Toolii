# Module 2: Image Tools (Free Acquisition Features)

Status: draft | Updated: 2026-03-03

All image tools are free, no login required. Rate-limited to prevent abuse.

---

## Feature Set

| Feature | Description | Tech | Priority |
|---------|-------------|------|----------|
| Image compress | Custom quality / target size | Pillow | P0 |
| Compress to target size | Set max size (e.g. 2MB/5MB), auto multi-pass compress | Pillow binary search | P0 |
| HEIC to JPG | Apple user essential | pillow-heif | P0 |
| Format convert | PNG/JPG/WEBP interconvert | Pillow | P0 |
| Mosaic / pixelate | Select region to pixelate, redact passport number, address, bank statements | Pillow pixelation | P0 |
| Scan enhance | Auto-crop, perspective correction, shadow removal, B&W mode, improve upload quality | OpenCV + Pillow | P0 |
| Image crop | Free crop / fixed ratio | Frontend interaction + Pillow | P1 |
| Batch process + zip download | Batch compress/convert, zip download results | Async backend task + zipfile | P0 |
| Image stitch | Combine multiple images into one | Pillow | P2 |

---

## Processing Notes

- All image tools run on CPU (Backend local processing). No GPU / Cortex dependency.
- Mosaic processing is planned to move to client-side Canvas (see frontend-upgrade.md Phase 4B).
- Batch processing limited to 20 files, 100MB total per request.
- Single file size limit: 20MB for images.
