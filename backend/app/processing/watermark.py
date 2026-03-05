"""Shared watermark utility for gated tool results."""

from __future__ import annotations

import io

from PIL import Image, ImageDraw, ImageFont


def _save_image(image: Image.Image, content_type: str) -> bytes:
    """Save image to bytes in the format matching *content_type*."""
    buf = io.BytesIO()
    ct = (content_type or "").lower()
    if ct == "image/jpeg":
        image = image.convert("RGB")
        image.save(buf, format="JPEG", quality=85, optimize=True)
    elif ct == "image/webp":
        image.save(buf, format="WEBP", quality=85)
    else:
        image.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def apply_watermark(
    image_bytes: bytes,
    content_type: str = "image/png",
    *,
    text: str = "TOOLII",
) -> bytes:
    """Apply a tiled semi-transparent watermark over *image_bytes*.

    Supports JPEG, PNG, and WebP input/output.  Returns bytes in the
    same format indicated by *content_type*.
    """
    image = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    font = ImageFont.load_default()

    # Tiled diagonal pattern
    step_x = max(80, image.width // 3)
    step_y = max(70, image.height // 4)
    for y in range(-20, image.height + step_y, step_y):
        for x in range(-40, image.width + step_x, step_x):
            draw.text((x, y), text, fill=(255, 255, 255, 72), font=font)

    # Center label
    center_text = "Preview"
    bbox = draw.textbbox((0, 0), center_text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    cx = (image.width - tw) // 2
    cy = (image.height - th) // 2
    draw.rectangle((cx - 8, cy - 5, cx + tw + 8, cy + th + 5), fill=(0, 0, 0, 72))
    draw.text((cx, cy), center_text, fill=(255, 255, 255, 220), font=font)

    composited = Image.alpha_composite(image, overlay)
    return _save_image(composited, content_type)
