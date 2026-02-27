from __future__ import annotations

from typing import Literal

from PIL import Image

from app.processing.image_io import has_alpha, open_image, save_image


OutputFormat = Literal["jpeg", "png", "webp"]


def convert_image(
    image_bytes: bytes,
    *,
    output_format: OutputFormat,
    quality: int | None = None,
) -> tuple[bytes, str]:
    img = open_image(image_bytes)

    fmt = output_format.lower()
    if fmt in ("jpeg", "jpg"):
        mime = "image/jpeg"
    elif fmt == "png":
        mime = "image/png"
    elif fmt == "webp":
        mime = "image/webp"
    else:
        raise ValueError("Unsupported output format")

    # Ensure correct mode for JPEG
    if fmt in ("jpeg", "jpg") and img.mode not in ("RGB", "L"):
        background = Image.new("RGB", img.size, (255, 255, 255))
        if has_alpha(img):
            background.paste(img, mask=img.getchannel("A"))
        else:
            background.paste(img)
        img = background

    out = save_image(img, output_format=fmt, quality=quality)
    return out, mime

