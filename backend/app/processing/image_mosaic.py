from __future__ import annotations

import math
from typing import Iterable, TypedDict

from PIL import Image

from app.processing.image_io import has_alpha, open_image, save_image


class MosaicRegion(TypedDict, total=False):
    x: float
    y: float
    w: float
    h: float


def _to_box(img: Image.Image, region: MosaicRegion) -> tuple[int, int, int, int]:
    width, height = img.size
    x = region.get("x", 0.0)
    y = region.get("y", 0.0)
    w = region.get("w", float(width))
    h = region.get("h", float(height))

    # Support normalized coordinates (0..1).
    if 0.0 <= x <= 1.0 and 0.0 <= y <= 1.0 and 0.0 < w <= 1.0 and 0.0 < h <= 1.0:
        x *= width
        y *= height
        w *= width
        h *= height

    x1 = max(0, min(width, int(math.floor(x))))
    y1 = max(0, min(height, int(math.floor(y))))
    x2 = max(0, min(width, int(math.ceil(x1 + w))))
    y2 = max(0, min(height, int(math.ceil(y1 + h))))
    if x2 <= x1 or y2 <= y1:
        return 0, 0, width, height
    return x1, y1, x2, y2


def mosaic_image(
    image_bytes: bytes,
    *,
    regions: Iterable[MosaicRegion] | None = None,
    pixel_size: int = 12,
) -> tuple[bytes, str]:
    img = open_image(image_bytes)

    if pixel_size < 2:
        pixel_size = 2

    region_list = list(regions or [])
    if not region_list:
        region_list = [{"x": 0.0, "y": 0.0, "w": float(img.size[0]), "h": float(img.size[1])}]

    for region in region_list:
        x1, y1, x2, y2 = _to_box(img, region)
        crop = img.crop((x1, y1, x2, y2))
        w = max(1, (x2 - x1) // pixel_size)
        h = max(1, (y2 - y1) // pixel_size)
        small = crop.resize((w, h), resample=Image.Resampling.NEAREST)
        mosaic = small.resize((x2 - x1, y2 - y1), resample=Image.Resampling.NEAREST)
        img.paste(mosaic, (x1, y1))

    output_format = "png" if has_alpha(img) else "jpeg"
    mime = "image/png" if output_format == "png" else "image/jpeg"
    out = save_image(img, output_format=output_format, quality=92)
    return out, mime

