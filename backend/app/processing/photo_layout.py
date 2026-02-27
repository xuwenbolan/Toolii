from __future__ import annotations

import io
from typing import Any

from PIL import Image, ImageDraw

from app.processing.image_io import open_image


def create_print_layout(
    photo_bytes: bytes,
    *,
    copies: int = 8,
    canvas_width: int = 1800,
    canvas_height: int = 1200,
    dpi: int = 300,
    margin_px: int = 40,
    gap_px: int = 24,
    cut_guides: bool = True,
) -> tuple[bytes, dict[str, Any]]:
    photo = open_image(photo_bytes).convert("RGB")
    photo_w, photo_h = photo.size
    if copies < 1:
        copies = 1

    canvas = Image.new("RGB", (canvas_width, canvas_height), (255, 255, 255))

    usable_w = canvas_width - margin_px * 2
    usable_h = canvas_height - margin_px * 2
    if photo_w > usable_w or photo_h > usable_h:
        scale = min(usable_w / photo_w, usable_h / photo_h, 1.0)
        photo_w = max(1, int(photo_w * scale))
        photo_h = max(1, int(photo_h * scale))
        photo = photo.resize((photo_w, photo_h), Image.Resampling.LANCZOS)

    max_cols = max(1, (usable_w + gap_px) // (photo_w + gap_px))
    max_rows = max(1, (usable_h + gap_px) // (photo_h + gap_px))
    capacity = max_cols * max_rows
    count = min(copies, capacity)

    total_grid_cols = min(max_cols, count)
    total_grid_rows = (count + total_grid_cols - 1) // total_grid_cols

    grid_w = total_grid_cols * photo_w + (total_grid_cols - 1) * gap_px
    grid_h = total_grid_rows * photo_h + (total_grid_rows - 1) * gap_px
    start_x = (canvas_width - grid_w) // 2
    start_y = (canvas_height - grid_h) // 2

    placements: list[dict[str, int]] = []
    for idx in range(count):
        row = idx // total_grid_cols
        col = idx % total_grid_cols
        x = start_x + col * (photo_w + gap_px)
        y = start_y + row * (photo_h + gap_px)
        canvas.paste(photo, (x, y))
        placements.append({"x": x, "y": y, "w": photo_w, "h": photo_h})

    if cut_guides:
        draw = ImageDraw.Draw(canvas)
        for item in placements:
            x1 = item["x"]
            y1 = item["y"]
            x2 = x1 + item["w"] - 1
            y2 = y1 + item["h"] - 1
            draw.rectangle((x1, y1, x2, y2), outline=(210, 210, 210), width=2)

    out = io.BytesIO()
    canvas.save(out, format="JPEG", quality=94, optimize=True, dpi=(dpi, dpi))
    return out.getvalue(), {"placements": placements, "capacity": capacity, "count": count}
