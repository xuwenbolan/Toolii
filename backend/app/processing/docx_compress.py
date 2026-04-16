"""DOCX compression: recompress images and strip metadata."""

from __future__ import annotations

import io
import logging
import zipfile

from PIL import Image

logger = logging.getLogger(__name__)

# Image entries live under word/media/
_MEDIA_PREFIX = "word/media/"
_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".tif"}

# Metadata entries to strip
_STRIP_ENTRIES = {"docProps/thumbnail.jpeg", "docProps/thumbnail.png", "docProps/thumbnail.emf"}

# Max image dimension (pixels) — larger images are downscaled
_MAX_DIMENSION = 2000


def compress_docx(docx_bytes: bytes, image_quality: int = 75) -> bytes:
    """Compress DOCX by recompressing embedded images and stripping metadata.

    Returns the compressed DOCX as bytes.
    """
    image_quality = max(30, min(95, image_quality))

    src = zipfile.ZipFile(io.BytesIO(docx_bytes), "r")
    dst_buf = io.BytesIO()
    dst = zipfile.ZipFile(dst_buf, "w", compression=zipfile.ZIP_DEFLATED)

    original_image_size = 0
    compressed_image_size = 0
    images_processed = 0

    for info in src.infolist():
        entry_name = info.filename

        # Skip metadata thumbnails
        if entry_name in _STRIP_ENTRIES:
            logger.debug("Stripped: %s", entry_name)
            continue

        data = src.read(entry_name)

        # Strip sensitive fields from core/app properties
        if entry_name == "docProps/core.xml":
            data = _strip_core_properties(data)
            dst.writestr(info, data)
            continue

        if entry_name == "docProps/app.xml":
            data = _strip_app_properties(data)
            dst.writestr(info, data)
            continue

        # Compress images
        if _is_image_entry(entry_name):
            original_image_size += len(data)
            compressed_data, new_name = _compress_image(data, entry_name, image_quality)
            compressed_image_size += len(compressed_data)
            images_processed += 1

            if new_name != entry_name:
                # Format changed (e.g., PNG→JPEG) — update the entry name
                # Note: this requires updating references in document.xml too,
                # which is complex. For safety, keep the original name.
                dst.writestr(info, compressed_data)
            else:
                dst.writestr(info, compressed_data)
        else:
            dst.writestr(info, data)

    src.close()
    dst.close()

    saved = original_image_size - compressed_image_size
    logger.info(
        "Compressed %d images: %d KB → %d KB (saved %d KB)",
        images_processed,
        original_image_size // 1024,
        compressed_image_size // 1024,
        saved // 1024,
    )

    return dst_buf.getvalue()


def _is_image_entry(name: str) -> bool:
    """Check if a ZIP entry is an image under word/media/."""
    if not name.startswith(_MEDIA_PREFIX):
        return False
    lower = name.lower()
    return any(lower.endswith(ext) for ext in _IMAGE_EXTENSIONS)


def _compress_image(data: bytes, entry_name: str, quality: int) -> tuple[bytes, str]:
    """Recompress an image, optionally downscaling. Returns (bytes, name)."""
    try:
        img = Image.open(io.BytesIO(data))
    except Exception:
        # Not a valid image — return as-is
        return data, entry_name

    # Downscale if too large
    w, h = img.size
    if max(w, h) > _MAX_DIMENSION:
        ratio = _MAX_DIMENSION / max(w, h)
        new_w, new_h = int(w * ratio), int(h * ratio)
        img = img.resize((new_w, new_h), Image.LANCZOS)
        logger.debug("Downscaled %s: %dx%d → %dx%d", entry_name, w, h, new_w, new_h)

    buf = io.BytesIO()
    lower = entry_name.lower()

    if lower.endswith(".png"):
        has_alpha = img.mode in ("RGBA", "LA", "PA") or (
            img.mode == "P" and "transparency" in img.info
        )
        if has_alpha:
            # Keep PNG format for transparency
            img.save(buf, format="PNG", optimize=True)
        else:
            # Convert opaque PNG to JPEG for better compression
            if img.mode != "RGB":
                img = img.convert("RGB")
            img.save(buf, format="JPEG", quality=quality, optimize=True)
            # Keep the .png extension to avoid breaking DOCX references
    elif lower.endswith((".jpg", ".jpeg")):
        if img.mode != "RGB":
            img = img.convert("RGB")
        img.save(buf, format="JPEG", quality=quality, optimize=True)
    elif lower.endswith((".gif",)):
        img.save(buf, format="GIF", optimize=True)
    elif lower.endswith((".bmp",)):
        # Convert BMP to JPEG
        if img.mode != "RGB":
            img = img.convert("RGB")
        img.save(buf, format="JPEG", quality=quality, optimize=True)
    elif lower.endswith((".tiff", ".tif")):
        if img.mode != "RGB":
            img = img.convert("RGB")
        img.save(buf, format="JPEG", quality=quality, optimize=True)
    else:
        return data, entry_name

    result = buf.getvalue()
    # Only use compressed version if it's actually smaller
    if len(result) < len(data):
        return result, entry_name
    return data, entry_name


def _strip_core_properties(xml_data: bytes) -> bytes:
    """Strip sensitive fields from docProps/core.xml."""
    try:
        from lxml import etree
        tree = etree.fromstring(xml_data)
        # Remove creator, lastModifiedBy
        nsmap = {
            "dc": "http://purl.org/dc/elements/1.1/",
            "cp": "http://schemas.openxmlformats.org/package/2006/metadata/core-properties",
        }
        for tag in ["dc:creator", "cp:lastModifiedBy"]:
            for elem in tree.findall(tag, nsmap):
                elem.text = ""
        return etree.tostring(tree, xml_declaration=True, encoding="UTF-8", standalone=True)
    except Exception:
        return xml_data


def _strip_app_properties(xml_data: bytes) -> bytes:
    """Strip sensitive fields from docProps/app.xml."""
    try:
        from lxml import etree
        tree = etree.fromstring(xml_data)
        ns = {"ep": "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"}
        for tag in ["ep:Company", "ep:Manager"]:
            for elem in tree.findall(tag, ns):
                elem.text = ""
        return etree.tostring(tree, xml_declaration=True, encoding="UTF-8", standalone=True)
    except Exception:
        return xml_data
