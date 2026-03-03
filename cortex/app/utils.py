"""Shared image encoding/decoding utilities for Cortex engines."""
from __future__ import annotations

import base64
import io

import numpy as np
from PIL import Image


def decode_image(image_b64: str) -> tuple[np.ndarray, tuple[int, int]]:
    """Decode base64 image to RGB numpy array. Returns (array, (w, h))."""
    raw = base64.b64decode(image_b64)
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    return np.array(img), img.size


def decode_image_rgba(image_b64: str) -> tuple[np.ndarray, tuple[int, int]]:
    """Decode base64 image to RGBA numpy array. Returns (array, (w, h))."""
    raw = base64.b64decode(image_b64)
    img = Image.open(io.BytesIO(raw)).convert("RGBA")
    return np.array(img), img.size


def encode_png(arr: np.ndarray, mode: str = "RGB") -> str:
    """Encode numpy array to base64 PNG string."""
    img = Image.fromarray(arr, mode=mode)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode("ascii")
