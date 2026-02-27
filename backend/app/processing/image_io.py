from __future__ import annotations

import io

from PIL import Image, ImageOps

try:
    import pillow_heif

    pillow_heif.register_heif_opener()
except ImportError:
    # pillow-heif is optional; other formats will still work.
    pillow_heif = None  # type: ignore[assignment]


def open_image(image_bytes: bytes) -> Image.Image:
    with Image.open(io.BytesIO(image_bytes)) as img:
        img = ImageOps.exif_transpose(img)
        return img.copy()


def has_alpha(img: Image.Image) -> bool:
    if img.mode in ("RGBA", "LA"):
        return True
    if img.mode == "P":
        return "transparency" in img.info
    return False


def save_image(
    img: Image.Image,
    *,
    output_format: str,
    quality: int | None = None,
    optimize: bool = True,
) -> bytes:
    buf = io.BytesIO()

    fmt = output_format.upper()
    save_kwargs: dict[str, object] = {}

    if fmt in ("JPEG", "JPG"):
        save_kwargs.update(
            {
                "format": "JPEG",
                "quality": int(quality or 85),
                "optimize": optimize,
                "progressive": True,
            }
        )
    elif fmt == "PNG":
        save_kwargs.update({"format": "PNG", "optimize": optimize})
    elif fmt == "WEBP":
        save_kwargs.update(
            {
                "format": "WEBP",
                "quality": int(quality or 82),
                "method": 6,
            }
        )
    else:
        raise ValueError(f"Unsupported output format: {output_format}")

    img.save(buf, **save_kwargs)
    return buf.getvalue()

