from __future__ import annotations

from typing import Literal

from PIL import Image

from app.processing.image_io import has_alpha, open_image, save_image


OutputFormat = Literal["jpeg", "png", "webp"]


def compress_image(
    image_bytes: bytes,
    *,
    output_format: OutputFormat | None = None,
    quality: int | None = None,
    max_bytes: int | None = None,
) -> tuple[bytes, str]:
    img = open_image(image_bytes)

    if output_format is None:
        output_format = "png" if has_alpha(img) else "jpeg"

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

    # If max_bytes is not set, do a single save.
    if not max_bytes:
        out = save_image(img, output_format=fmt, quality=quality)
        return out, mime

    # For PNG, quality doesn't apply; fallback to WEBP/JPEG when size targeting is requested.
    if fmt == "png":
        fmt = "webp" if has_alpha(img) else "jpeg"
        mime = "image/webp" if fmt == "webp" else "image/jpeg"

    lo = 20
    hi = 95
    best: bytes | None = None

    for _ in range(9):
        mid = (lo + hi) // 2
        out = save_image(img, output_format=fmt, quality=mid)
        if len(out) <= max_bytes:
            best = out
            lo = mid + 1
        else:
            hi = mid - 1

    if best is None:
        best = save_image(img, output_format=fmt, quality=lo)

    return best, mime

