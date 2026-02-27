from __future__ import annotations

import io

from PIL import Image

from app.processing.image_io import has_alpha, open_image


def _to_rgb_page(img: Image.Image) -> Image.Image:
    if img.mode == "RGB":
        return img.copy()

    rgba = img.convert("RGBA")
    background = Image.new("RGB", rgba.size, (255, 255, 255))
    if has_alpha(rgba):
        background.paste(rgba, mask=rgba.getchannel("A"))
    else:
        background.paste(rgba)
    return background


def images_to_pdf(image_files: list[bytes], *, dpi: int = 150) -> bytes:
    if not image_files:
        raise ValueError("No image files provided")

    pages: list[Image.Image] = []
    try:
        for data in image_files:
            pages.append(_to_rgb_page(open_image(data)))

        first, *rest = pages
        out = io.BytesIO()
        first.save(
            out,
            format="PDF",
            save_all=True,
            append_images=rest,
            resolution=float(dpi),
        )
        return out.getvalue()
    finally:
        for page in pages:
            try:
                page.close()
            except OSError:
                pass

