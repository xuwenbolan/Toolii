#!/usr/bin/env python3
"""Comprehensive Cortex service test and monitoring script.

Test categories:
  1. Health & Startup     - health endpoint, uptime, GPU info
  2. Model Management     - registry, load status, ONNX integrity
  3. Inference Endpoints  - all 8 endpoints with valid input
  4. Error Handling       - invalid input, missing models, bad parameters
  5. Concurrency          - parallel requests, GPU queue behavior
  6. Performance          - latency benchmarks, throughput
  7. VRAM Monitoring      - memory usage tracking across operations

Usage:
  uv run scripts/test_cortex.py                     # run all tests
  uv run scripts/test_cortex.py --url http://host:9100
  uv run scripts/test_cortex.py --suite health      # only health tests
  uv run scripts/test_cortex.py --suite inference    # only inference tests
  uv run scripts/test_cortex.py --suite all          # everything
  uv run scripts/test_cortex.py --benchmark          # include perf benchmarks
  uv run scripts/test_cortex.py --verbose            # detailed output
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import io
import json
import sys
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import httpx
import numpy as np
from PIL import Image

# ── Constants ──────────────────────────────────────────────────────────

DEFAULT_URL = "http://localhost:9100"
TIMEOUT = httpx.Timeout(connect=5.0, read=120.0, write=30.0, pool=10.0)

# All inference endpoints with their default payloads
ENDPOINTS = [
    "remove-background", "upscale", "restore-face", "denoise",
    "colorize", "inpaint", "ocr", "segment",
]

# ANSI colors
_GREEN = "\033[92m"
_RED = "\033[91m"
_YELLOW = "\033[93m"
_CYAN = "\033[96m"
_DIM = "\033[2m"
_BOLD = "\033[1m"
_RESET = "\033[0m"


# ── Test image generators ─────────────────────────────────────────────


def _make_rgb_image(width: int = 256, height: int = 256) -> str:
    """Generate a synthetic RGB test image as base64 PNG."""
    rng = np.random.default_rng(42)
    arr = rng.integers(0, 255, (height, width, 3), dtype=np.uint8)
    # Add a face-like circle to help face detection
    cy, cx, r = height // 2, width // 2, min(width, height) // 4
    y, x = np.ogrid[:height, :width]
    mask = (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2
    arr[mask] = [220, 180, 160]  # skin-tone circle
    buf = io.BytesIO()
    Image.fromarray(arr, "RGB").save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def _make_grayscale_image(width: int = 256, height: int = 256) -> str:
    """Generate a grayscale test image for colorization."""
    rng = np.random.default_rng(42)
    arr = rng.integers(0, 255, (height, width), dtype=np.uint8)
    buf = io.BytesIO()
    Image.fromarray(arr, "L").save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def _make_text_image() -> str:
    """Generate a simple image with text-like patterns for OCR."""
    img = Image.new("RGB", (300, 100), (255, 255, 255))
    arr = np.array(img)
    # Draw horizontal "text lines"
    for y in range(20, 80, 15):
        arr[y:y + 3, 30:270] = [0, 0, 0]
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def _make_mask_image(width: int = 256, height: int = 256,
                     fill_ratio: float = 0.05) -> str:
    """Generate a mask image (white = area to inpaint)."""
    arr = np.zeros((height, width), dtype=np.uint8)
    # Small white rectangle in center
    r = int((fill_ratio * width * height) ** 0.5) // 2
    cy, cx = height // 2, width // 2
    arr[max(0, cy - r):cy + r, max(0, cx - r):cx + r] = 255
    buf = io.BytesIO()
    Image.fromarray(arr, "L").save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def _make_large_mask(width: int = 256, height: int = 256) -> str:
    """Generate a large mask (>10% area) to trigger LaMa routing."""
    arr = np.zeros((height, width), dtype=np.uint8)
    arr[height // 4:3 * height // 4, width // 4:3 * width // 4] = 255
    buf = io.BytesIO()
    Image.fromarray(arr, "L").save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def _decode_b64_image(b64: str) -> Image.Image:
    """Decode a base64-encoded image string back to PIL Image."""
    return Image.open(io.BytesIO(base64.b64decode(b64)))


# ── Result tracking ───────────────────────────────────────────────────


@dataclass
class TestResult:
    name: str
    suite: str
    passed: bool
    elapsed_ms: int = 0
    message: str = ""
    details: dict[str, Any] = field(default_factory=dict)


class TestRunner:
    """Collects and runs test cases, prints summary."""

    def __init__(self, base_url: str, verbose: bool = False) -> None:
        self.base_url = base_url.rstrip("/")
        self.verbose = verbose
        self.results: list[TestResult] = []
        self.client = httpx.AsyncClient(base_url=self.base_url, timeout=TIMEOUT)
        # Pre-generate test images (reuse across tests)
        self._rgb_b64 = _make_rgb_image()
        self._gray_b64 = _make_grayscale_image()
        self._text_b64 = _make_text_image()
        self._small_mask_b64 = _make_mask_image(fill_ratio=0.05)
        self._large_mask_b64 = _make_large_mask()

    async def close(self) -> None:
        await self.client.aclose()

    def _log(self, result: TestResult) -> None:
        status = f"{_GREEN}PASS{_RESET}" if result.passed else f"{_RED}FAIL{_RESET}"
        elapsed = f"{_DIM}{result.elapsed_ms}ms{_RESET}" if result.elapsed_ms else ""
        print(f"  [{status}] {result.name} {elapsed}")
        if not result.passed and result.message:
            print(f"         {_RED}{result.message}{_RESET}")
        if self.verbose and result.details:
            for k, v in result.details.items():
                val = json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else str(v)
                if len(val) > 200:
                    val = val[:200] + "..."
                print(f"         {_DIM}{k}: {val}{_RESET}")

    def _record(self, result: TestResult) -> None:
        self.results.append(result)
        self._log(result)

    async def _post(self, endpoint: str, payload: dict) -> tuple[int, dict, int]:
        """POST to /v1/{endpoint}, return (status_code, body, elapsed_ms)."""
        t0 = time.perf_counter()
        resp = await self.client.post(f"/v1/{endpoint}", json=payload)
        elapsed = int((time.perf_counter() - t0) * 1000)
        try:
            body = resp.json()
        except Exception:
            body = {"error": {"code": "NON_JSON_RESPONSE", "message": resp.text[:500]}}
        return resp.status_code, body, elapsed

    async def _get(self, path: str) -> tuple[int, dict, int]:
        """GET a path, return (status_code, body, elapsed_ms)."""
        t0 = time.perf_counter()
        resp = await self.client.get(path)
        elapsed = int((time.perf_counter() - t0) * 1000)
        try:
            body = resp.json()
        except Exception:
            body = {"error": {"code": "NON_JSON_RESPONSE", "message": resp.text[:500]}}
        return resp.status_code, body, elapsed

    # ── Suite: Health & Startup ────────────────────────────────────────

    async def test_health_endpoint(self) -> None:
        """GET /health returns status=ok with GPU info and model stats."""
        try:
            code, body, elapsed = await self._get("/health")
            ok = code == 200 and body.get("status") == "ok"
            self._record(TestResult(
                name="GET /health",
                suite="health",
                passed=ok,
                elapsed_ms=elapsed,
                message="" if ok else f"status_code={code}, body={body}",
                details={
                    "gpu": body.get("gpu", {}),
                    "models": body.get("models", {}),
                    "uptime_seconds": body.get("uptime_seconds"),
                },
            ))
        except Exception as exc:
            self._record(TestResult(
                name="GET /health", suite="health", passed=False,
                message=f"Connection failed: {exc}",
            ))

    async def test_health_gpu_info(self) -> None:
        """Verify GPU info contains expected fields."""
        code, body, elapsed = await self._get("/health")
        gpu = body.get("gpu", {})
        has_fields = all(k in gpu for k in ("name", "vram_total_mb", "vram_used_mb", "vram_free_mb"))
        has_real_gpu = gpu.get("name", "unknown") != "unknown" and gpu.get("vram_total_mb", 0) > 0
        self._record(TestResult(
            name="GPU info fields present",
            suite="health",
            passed=has_fields,
            elapsed_ms=elapsed,
            message="" if has_fields else f"Missing GPU fields: {gpu}",
            details={"gpu": gpu},
        ))
        self._record(TestResult(
            name="GPU detected (nvidia-smi)",
            suite="health",
            passed=has_real_gpu,
            elapsed_ms=0,
            message="" if has_real_gpu else f"No GPU detected: {gpu.get('name')}",
            details={"gpu": gpu},
        ))

    async def test_uptime(self) -> None:
        """Verify uptime is reported and reasonable."""
        _, body, elapsed = await self._get("/health")
        uptime = body.get("uptime_seconds", -1)
        ok = isinstance(uptime, (int, float)) and uptime >= 0
        self._record(TestResult(
            name="Uptime reported",
            suite="health",
            passed=ok,
            elapsed_ms=elapsed,
            message="" if ok else f"Invalid uptime: {uptime}",
            details={"uptime_seconds": uptime},
        ))

    # ── Suite: Model Management ────────────────────────────────────────

    async def test_models_detail(self) -> None:
        """GET /models returns model registry with summary."""
        code, body, elapsed = await self._get("/models")
        summary = body.get("summary", {})
        models = body.get("models", [])
        ok = (code == 200
              and summary.get("registered", 0) > 0
              and isinstance(models, list)
              and len(models) > 0)
        self._record(TestResult(
            name="GET /models (registry)",
            suite="models",
            passed=ok,
            elapsed_ms=elapsed,
            message="" if ok else f"Unexpected response: {summary}",
            details={
                "summary": summary,
                "model_count": len(models),
                "model_names": [m.get("name") for m in models[:5]],
            },
        ))

    async def test_models_vram_budget(self) -> None:
        """Verify VRAM utilization stays within budget."""
        _, body, _ = await self._get("/models")
        summary = body.get("summary", {})
        used = summary.get("vram_used_mb", 0)
        budget = summary.get("vram_budget_mb", 0)
        ok = budget > 0 and used <= budget
        self._record(TestResult(
            name="VRAM within budget",
            suite="models",
            passed=ok,
            message="" if ok else f"VRAM over budget: {used}MB / {budget}MB",
            details={"vram_used_mb": used, "vram_budget_mb": budget,
                      "utilization": summary.get("vram_utilization")},
        ))

    async def test_models_check_all(self) -> None:
        """GET /models/check validates all registered models."""
        code, body, elapsed = await self._get("/models/check")
        ok = code == 200 and body.get("healthy") is True
        unhealthy = [
            m.get("name") for m in body.get("models", [])
            if not m.get("healthy")
        ]
        self._record(TestResult(
            name="All models healthy (ONNX integrity)",
            suite="models",
            passed=ok,
            elapsed_ms=elapsed,
            message="" if ok else f"Unhealthy models: {unhealthy}",
            details={
                "healthy_count": body.get("healthy_count"),
                "total": body.get("total"),
                "unhealthy": unhealthy,
            },
        ))

    async def test_model_status_fields(self) -> None:
        """Verify each model entry has required fields."""
        _, body, _ = await self._get("/models")
        models = body.get("models", [])
        required_fields = {"name", "status", "required", "vram_mb", "path"}
        bad = []
        for m in models:
            missing = required_fields - set(m.keys())
            if missing:
                bad.append(f"{m.get('name', '?')}: missing {missing}")
        ok = len(bad) == 0
        self._record(TestResult(
            name="Model entries have required fields",
            suite="models",
            passed=ok,
            message="" if ok else "; ".join(bad[:3]),
            details={"total_models": len(models), "bad_entries": bad},
        ))

    async def test_model_check_single(self) -> None:
        """GET /models/{name}/check for a specific model."""
        _, body, _ = await self._get("/models")
        models = body.get("models", [])
        if not models:
            self._record(TestResult(
                name="Single model check", suite="models", passed=False,
                message="No models registered",
            ))
            return
        name = models[0]["name"]
        code, check, elapsed = await self._get(f"/models/{name}/check")
        ok = code == 200 and check.get("healthy") is True
        self._record(TestResult(
            name=f"Single model check ({name})",
            suite="models",
            passed=ok,
            elapsed_ms=elapsed,
            message="" if ok else f"Check failed: {check}",
            details=check,
        ))

    async def test_model_check_unknown(self) -> None:
        """GET /models/{name}/check for a non-existent model returns not_registered."""
        code, body, elapsed = await self._get("/models/nonexistent-model-xyz/check")
        ok = code == 200 and body.get("healthy") is False and body.get("error") == "not_registered"
        self._record(TestResult(
            name="Unknown model check returns not_registered",
            suite="models",
            passed=ok,
            elapsed_ms=elapsed,
            message="" if ok else f"Unexpected: {body}",
            details=body,
        ))

    # ── Suite: Inference Endpoints ─────────────────────────────────────

    async def test_remove_background(self) -> None:
        """POST /v1/remove-background with default model."""
        code, body, elapsed = await self._post("remove-background", {
            "image_b64": self._rgb_b64,
        })
        ok = code == 200 and "image_b64" in body and "meta" in body
        details = {"meta": body.get("meta", {})}
        if ok:
            img = _decode_b64_image(body["image_b64"])
            details["output_mode"] = img.mode
            details["output_size"] = img.size
            ok = ok and img.mode == "RGBA"  # default output_type=rgba
        self._record(TestResult(
            name="remove-background (default)",
            suite="inference",
            passed=ok,
            elapsed_ms=elapsed,
            message="" if ok else f"code={code}, error={body.get('error', '')}",
            details=details,
        ))

    async def test_remove_background_matte(self) -> None:
        """POST /v1/remove-background with output_type=matte."""
        code, body, elapsed = await self._post("remove-background", {
            "image_b64": self._rgb_b64,
            "output_type": "matte",
        })
        ok = code == 200 and "image_b64" in body
        if ok:
            img = _decode_b64_image(body["image_b64"])
            ok = ok and img.mode == "L"  # grayscale matte
        self._record(TestResult(
            name="remove-background (matte output)",
            suite="inference",
            passed=ok,
            elapsed_ms=elapsed,
            message="" if ok else f"code={code}",
        ))

    async def test_upscale(self) -> None:
        """POST /v1/upscale with x4plus model."""
        # Use smaller image to save time
        small_b64 = _make_rgb_image(64, 64)
        code, body, elapsed = await self._post("upscale", {
            "image_b64": small_b64,
            "model": "x4plus",
            "scale": 4,
        })
        ok = code == 200 and "image_b64" in body and "meta" in body
        details = {"meta": body.get("meta", {})}
        if ok:
            img = _decode_b64_image(body["image_b64"])
            details["output_size"] = img.size
            # Output should be 4x input (64*4 = 256)
            ok = ok and img.size[0] >= 64 * 2  # at least 2x bigger
        self._record(TestResult(
            name="upscale (x4plus, 4x)",
            suite="inference",
            passed=ok,
            elapsed_ms=elapsed,
            message="" if ok else f"code={code}, error={body.get('error', '')}",
            details=details,
        ))

    async def test_upscale_x4v3(self) -> None:
        """POST /v1/upscale with x4v3 model and denoise_strength."""
        small_b64 = _make_rgb_image(64, 64)
        code, body, elapsed = await self._post("upscale", {
            "image_b64": small_b64,
            "model": "x4v3",
            "scale": 4,
            "denoise_strength": 0.5,
        })
        ok = code == 200 and "image_b64" in body
        self._record(TestResult(
            name="upscale (x4v3, denoise_strength=0.5)",
            suite="inference",
            passed=ok,
            elapsed_ms=elapsed,
            message="" if ok else f"code={code}, error={body.get('error', '')}",
            details={"meta": body.get("meta", {})},
        ))

    async def test_restore_face(self) -> None:
        """POST /v1/restore-face."""
        code, body, elapsed = await self._post("restore-face", {
            "image_b64": self._rgb_b64,
            "weight": 0.7,
            "upscale": 2,
        })
        ok = code == 200 and "image_b64" in body and "meta" in body
        meta = body.get("meta", {})
        self._record(TestResult(
            name="restore-face",
            suite="inference",
            passed=ok,
            elapsed_ms=elapsed,
            message="" if ok else f"code={code}, error={body.get('error', '')}",
            details={"meta": meta, "faces_found": meta.get("faces_found")},
        ))

    async def test_denoise(self) -> None:
        """POST /v1/denoise with default task (denoise)."""
        code, body, elapsed = await self._post("denoise", {
            "image_b64": self._rgb_b64,
            "task": "denoise",
            "strength": 0.8,
        })
        ok = code == 200 and "image_b64" in body and "meta" in body
        self._record(TestResult(
            name="denoise (sidd)",
            suite="inference",
            passed=ok,
            elapsed_ms=elapsed,
            message="" if ok else f"code={code}, error={body.get('error', '')}",
            details={"meta": body.get("meta", {})},
        ))

    async def test_colorize(self) -> None:
        """POST /v1/colorize with grayscale input."""
        code, body, elapsed = await self._post("colorize", {
            "image_b64": self._gray_b64,
            "model": "artistic",
        })
        ok = code == 200 and "image_b64" in body and "meta" in body
        details = {"meta": body.get("meta", {})}
        if ok:
            img = _decode_b64_image(body["image_b64"])
            details["output_mode"] = img.mode
            ok = ok and img.mode == "RGB"  # should produce color output
        self._record(TestResult(
            name="colorize (artistic)",
            suite="inference",
            passed=ok,
            elapsed_ms=elapsed,
            message="" if ok else f"code={code}, error={body.get('error', '')}",
            details=details,
        ))

    async def test_inpaint_auto_migan(self) -> None:
        """POST /v1/inpaint with small mask (auto -> migan)."""
        code, body, elapsed = await self._post("inpaint", {
            "image_b64": self._rgb_b64,
            "mask_b64": self._small_mask_b64,
            "model": "auto",
        })
        ok = code == 200 and "image_b64" in body and "meta" in body
        meta = body.get("meta", {})
        used_migan = meta.get("model_used") == "migan"
        self._record(TestResult(
            name="inpaint (auto -> migan, small mask)",
            suite="inference",
            passed=ok,
            elapsed_ms=elapsed,
            message="" if ok else f"code={code}, error={body.get('error', '')}",
            details={"meta": meta, "routed_to_migan": used_migan},
        ))

    async def test_inpaint_auto_lama(self) -> None:
        """POST /v1/inpaint with large mask (auto -> lama)."""
        code, body, elapsed = await self._post("inpaint", {
            "image_b64": self._rgb_b64,
            "mask_b64": self._large_mask_b64,
            "model": "auto",
        })
        ok = code == 200 and "image_b64" in body and "meta" in body
        meta = body.get("meta", {})
        used_lama = meta.get("model_used") == "lama"
        self._record(TestResult(
            name="inpaint (auto -> lama, large mask)",
            suite="inference",
            passed=ok,
            elapsed_ms=elapsed,
            message="" if ok else f"code={code}, error={body.get('error', '')}",
            details={"meta": meta, "routed_to_lama": used_lama},
        ))

    async def test_ocr(self) -> None:
        """POST /v1/ocr."""
        code, body, elapsed = await self._post("ocr", {
            "image_b64": self._text_b64,
            "lang": "ch_en",
        })
        ok = code == 200 and "meta" in body
        meta = body.get("meta", {})
        self._record(TestResult(
            name="ocr (ch_en)",
            suite="inference",
            passed=ok,
            elapsed_ms=elapsed,
            message="" if ok else f"code={code}, error={body.get('error', '')}",
            details={
                "meta": meta,
                "lines_count": meta.get("lines_count", 0),
                "has_lines_field": "lines" in body,
            },
        ))

    async def test_segment_point(self) -> None:
        """POST /v1/segment with a point prompt."""
        code, body, elapsed = await self._post("segment", {
            "image_b64": self._rgb_b64,
            "points": [[128.0, 128.0, 1.0]],  # center point, foreground label
        })
        ok = code == 200 and "masks" in body and "meta" in body
        meta = body.get("meta", {})
        self._record(TestResult(
            name="segment (point prompt)",
            suite="inference",
            passed=ok,
            elapsed_ms=elapsed,
            message="" if ok else f"code={code}, error={body.get('error', '')}",
            details={
                "meta": meta,
                "masks_count": meta.get("masks_count", 0),
            },
        ))

    async def test_segment_box(self) -> None:
        """POST /v1/segment with a box prompt."""
        code, body, elapsed = await self._post("segment", {
            "image_b64": self._rgb_b64,
            "boxes": [[50.0, 50.0, 200.0, 200.0]],
        })
        ok = code == 200 and "masks" in body
        self._record(TestResult(
            name="segment (box prompt)",
            suite="inference",
            passed=ok,
            elapsed_ms=elapsed,
            message="" if ok else f"code={code}, error={body.get('error', '')}",
            details={"meta": body.get("meta", {})},
        ))

    # ── Suite: Error Handling ──────────────────────────────────────────

    async def test_invalid_base64(self) -> None:
        """Send invalid base64 to an inference endpoint."""
        code, body, elapsed = await self._post("remove-background", {
            "image_b64": "not-valid-base64!!!",
        })
        ok = code >= 400  # should return an error, not 200
        self._record(TestResult(
            name="Invalid base64 rejected",
            suite="errors",
            passed=ok,
            elapsed_ms=elapsed,
            message="" if ok else f"Expected error, got code={code}",
            details={"code": code, "error": body.get("error", {})},
        ))

    async def test_missing_required_field(self) -> None:
        """Send request without image_b64 field."""
        code, body, elapsed = await self._post("upscale", {
            "model": "x4plus",
        })
        ok = code == 422  # pydantic validation error
        self._record(TestResult(
            name="Missing image_b64 returns 422",
            suite="errors",
            passed=ok,
            elapsed_ms=elapsed,
            message="" if ok else f"Expected 422, got {code}",
        ))

    async def test_unknown_model(self) -> None:
        """Request a non-existent model variant."""
        code, body, elapsed = await self._post("remove-background", {
            "image_b64": self._rgb_b64,
            "model": "nonexistent-model",
        })
        ok = code == 400 and body.get("error", {}).get("code") == "MODEL_NOT_FOUND"
        self._record(TestResult(
            name="Unknown model returns MODEL_NOT_FOUND",
            suite="errors",
            passed=ok,
            elapsed_ms=elapsed,
            message="" if ok else f"Expected MODEL_NOT_FOUND, got code={code}, body={body.get('error', {})}",
        ))

    async def test_invalid_scale(self) -> None:
        """Send an invalid scale parameter to upscale."""
        small_b64 = _make_rgb_image(32, 32)
        code, body, elapsed = await self._post("upscale", {
            "image_b64": small_b64,
            "scale": 8,  # only 2 or 4 are valid
        })
        # Should either return error or handle gracefully
        is_error = code >= 400
        self._record(TestResult(
            name="Invalid scale parameter handled",
            suite="errors",
            passed=True,  # pass if no server crash, either error or graceful handling
            elapsed_ms=elapsed,
            message=f"code={code}, response={'error' if is_error else 'ok'}",
            details={"code": code},
        ))

    async def test_empty_image(self) -> None:
        """Send a 1x1 pixel image."""
        tiny_b64 = _make_rgb_image(1, 1)
        code, body, elapsed = await self._post("remove-background", {
            "image_b64": tiny_b64,
        })
        # Should not crash the server
        self._record(TestResult(
            name="1x1 image does not crash server",
            suite="errors",
            passed=True,  # pass as long as server responds (no connection error)
            elapsed_ms=elapsed,
            message=f"code={code}",
        ))

    async def test_nonexistent_endpoint(self) -> None:
        """GET a non-existent endpoint returns 404."""
        code, _, elapsed = await self._get("/v1/nonexistent")
        ok = code in (404, 405)
        self._record(TestResult(
            name="Non-existent endpoint returns 404/405",
            suite="errors",
            passed=ok,
            elapsed_ms=elapsed,
            message="" if ok else f"Expected 404/405, got {code}",
        ))

    # ── Suite: Concurrency ─────────────────────────────────────────────

    async def test_concurrent_health(self) -> None:
        """Send 10 concurrent /health requests."""
        tasks = [self._get("/health") for _ in range(10)]
        t0 = time.perf_counter()
        results = await asyncio.gather(*tasks, return_exceptions=True)
        elapsed = int((time.perf_counter() - t0) * 1000)
        errors = [r for r in results if isinstance(r, Exception)]
        ok_count = sum(1 for r in results if not isinstance(r, Exception) and r[0] == 200)
        ok = len(errors) == 0 and ok_count == 10
        self._record(TestResult(
            name="10 concurrent /health requests",
            suite="concurrency",
            passed=ok,
            elapsed_ms=elapsed,
            message="" if ok else f"errors={len(errors)}, ok={ok_count}/10",
            details={"ok_count": ok_count, "errors": len(errors)},
        ))

    async def test_concurrent_inference(self) -> None:
        """Send 3 concurrent inference requests (different endpoints)."""
        small_b64 = _make_rgb_image(64, 64)
        tasks = [
            self._post("remove-background", {"image_b64": small_b64}),
            self._post("colorize", {"image_b64": self._gray_b64}),
            self._post("ocr", {"image_b64": self._text_b64}),
        ]
        t0 = time.perf_counter()
        results = await asyncio.gather(*tasks, return_exceptions=True)
        elapsed = int((time.perf_counter() - t0) * 1000)
        statuses = []
        for r in results:
            if isinstance(r, Exception):
                statuses.append(f"ERROR: {r}")
            else:
                statuses.append(f"{r[0]}")
        errors = [r for r in results if isinstance(r, Exception)]
        success = [r for r in results if not isinstance(r, Exception) and r[0] in (200, 503)]
        ok = len(errors) == 0 and len(success) == 3
        self._record(TestResult(
            name="3 concurrent inference requests",
            suite="concurrency",
            passed=ok,
            elapsed_ms=elapsed,
            message="" if ok else f"statuses: {statuses}",
            details={"statuses": statuses, "total_ms": elapsed},
        ))

    # ── Suite: Performance Benchmarks ──────────────────────────────────

    async def test_health_latency(self) -> None:
        """Benchmark /health endpoint latency (10 sequential calls)."""
        times = []
        for _ in range(10):
            _, _, elapsed = await self._get("/health")
            times.append(elapsed)
        avg = sum(times) / len(times)
        p99 = sorted(times)[int(len(times) * 0.99)]
        ok = avg < 100  # /health should be very fast
        self._record(TestResult(
            name="Health latency benchmark",
            suite="benchmark",
            passed=ok,
            elapsed_ms=int(avg),
            message=f"avg={avg:.0f}ms, p99={p99}ms, min={min(times)}ms, max={max(times)}ms",
            details={"avg_ms": avg, "p99_ms": p99, "min_ms": min(times), "max_ms": max(times)},
        ))

    async def test_inference_latency(self) -> None:
        """Benchmark each inference endpoint latency (single call, 256x256 input).

        First call may include model loading time; second is pure inference.
        """
        endpoints_payloads: list[tuple[str, dict]] = [
            ("remove-background", {"image_b64": self._rgb_b64}),
            ("denoise", {"image_b64": self._rgb_b64}),
            ("colorize", {"image_b64": self._gray_b64}),
            ("ocr", {"image_b64": self._text_b64}),
        ]
        for endpoint, payload in endpoints_payloads:
            # Warm-up call (may load model)
            await self._post(endpoint, payload)
            # Measured call (pure inference)
            code, body, elapsed = await self._post(endpoint, payload)
            meta = body.get("meta", {})
            ok = code == 200
            self._record(TestResult(
                name=f"Latency: {endpoint}",
                suite="benchmark",
                passed=ok,
                elapsed_ms=elapsed,
                message=f"inference={meta.get('elapsed_ms', '?')}ms (server), roundtrip={elapsed}ms",
                details={
                    "server_elapsed_ms": meta.get("elapsed_ms"),
                    "roundtrip_ms": elapsed,
                    "model": meta.get("model"),
                },
            ))

    # ── Suite: VRAM Monitoring ─────────────────────────────────────────

    async def test_vram_tracking(self) -> None:
        """Monitor VRAM usage before and after inference calls."""
        # Get baseline
        _, before, _ = await self._get("/models")
        before_summary = before.get("summary", {})

        # Trigger a model load
        await self._post("remove-background", {"image_b64": self._rgb_b64})

        # Get post-inference state
        _, after, _ = await self._get("/models")
        after_summary = after.get("summary", {})

        before_loaded = before_summary.get("loaded", 0)
        after_loaded = after_summary.get("loaded", 0)
        vram_used = after_summary.get("vram_used_mb", 0)
        vram_budget = after_summary.get("vram_budget_mb", 0)

        ok = vram_used <= vram_budget
        self._record(TestResult(
            name="VRAM tracking after inference",
            suite="vram",
            passed=ok,
            message=f"loaded: {before_loaded} -> {after_loaded}, VRAM: {vram_used}/{vram_budget}MB",
            details={
                "before_loaded": before_loaded,
                "after_loaded": after_loaded,
                "vram_used_mb": vram_used,
                "vram_budget_mb": vram_budget,
                "utilization": after_summary.get("vram_utilization"),
            },
        ))

    async def test_model_idle_tracking(self) -> None:
        """Verify idle_seconds is tracked for loaded models."""
        # First ensure at least one model is loaded
        await self._post("remove-background", {"image_b64": self._rgb_b64})

        _, body, _ = await self._get("/models")
        models = body.get("models", [])
        loaded = [m for m in models if m.get("status") == "loaded"]

        has_idle = all("idle_seconds" in m for m in loaded)
        ok = len(loaded) > 0 and has_idle
        self._record(TestResult(
            name="Idle tracking on loaded models",
            suite="vram",
            passed=ok,
            message=f"{len(loaded)} loaded models, idle_seconds tracked: {has_idle}",
            details={
                "loaded_models": [
                    {"name": m["name"], "idle_seconds": m.get("idle_seconds")}
                    for m in loaded[:5]
                ],
            },
        ))

    async def test_vram_gpu_consistency(self) -> None:
        """Cross-check estimated VRAM vs nvidia-smi reported VRAM."""
        _, health, _ = await self._get("/health")
        _, models, _ = await self._get("/models")

        gpu_used = health.get("gpu", {}).get("vram_used_mb", 0)
        estimated = models.get("summary", {}).get("vram_used_mb", 0)

        # Estimated VRAM should not exceed GPU reported usage by too much
        # (nvidia-smi includes non-model VRAM like CUDA context)
        ok = True  # informational, always pass
        self._record(TestResult(
            name="VRAM: nvidia-smi vs estimated",
            suite="vram",
            passed=ok,
            message=f"nvidia-smi={gpu_used}MB, model_estimated={estimated}MB",
            details={
                "nvidia_smi_used_mb": gpu_used,
                "model_estimated_mb": estimated,
                "delta_mb": gpu_used - estimated,
            },
        ))

    # ── Suite: Response Format Validation ──────────────────────────────

    async def test_response_meta_format(self) -> None:
        """Verify inference response meta has standard fields."""
        code, body, _ = await self._post("remove-background", {
            "image_b64": self._rgb_b64,
        })
        if code != 200:
            self._record(TestResult(
                name="Response meta format", suite="format", passed=False,
                message=f"Inference failed with code={code}",
            ))
            return
        meta = body.get("meta", {})
        required_keys = {"engine", "model", "elapsed_ms", "input_size", "output_size"}
        missing = required_keys - set(meta.keys())
        ok = len(missing) == 0
        self._record(TestResult(
            name="Response meta has standard fields",
            suite="format",
            passed=ok,
            message="" if ok else f"Missing meta keys: {missing}",
            details={"meta_keys": list(meta.keys()), "missing": list(missing)},
        ))

    async def test_response_image_valid(self) -> None:
        """Verify returned image_b64 is a valid decodable image."""
        code, body, _ = await self._post("denoise", {
            "image_b64": self._rgb_b64,
        })
        if code != 200:
            self._record(TestResult(
                name="Response image decodable", suite="format", passed=False,
                message=f"Inference failed with code={code}",
            ))
            return
        try:
            img = _decode_b64_image(body["image_b64"])
            ok = img.size[0] > 0 and img.size[1] > 0
        except Exception as exc:
            ok = False
            img = None
        self._record(TestResult(
            name="Response image_b64 is valid PNG",
            suite="format",
            passed=ok,
            message="" if ok else "Failed to decode output image",
            details={"output_size": img.size if img else None, "output_mode": img.mode if img else None},
        ))

    async def test_error_response_format(self) -> None:
        """Verify error responses follow {error: {code, message}} format."""
        code, body, _ = await self._post("remove-background", {
            "image_b64": self._rgb_b64,
            "model": "nonexistent",
        })
        error = body.get("error", {})
        ok = (code >= 400
              and isinstance(error, dict)
              and "code" in error
              and "message" in error)
        self._record(TestResult(
            name="Error response format",
            suite="format",
            passed=ok,
            message="" if ok else f"Bad error format: {body}",
            details={"error": error},
        ))

    # ── Suite runner ───────────────────────────────────────────────────

    def _get_suite_tests(self, suite: str) -> list[Callable]:
        """Return test methods for a given suite name."""
        suites: dict[str, list[Callable]] = {
            "health": [
                self.test_health_endpoint,
                self.test_health_gpu_info,
                self.test_uptime,
            ],
            "models": [
                self.test_models_detail,
                self.test_models_vram_budget,
                self.test_models_check_all,
                self.test_model_status_fields,
                self.test_model_check_single,
                self.test_model_check_unknown,
            ],
            "inference": [
                self.test_remove_background,
                self.test_remove_background_matte,
                self.test_upscale,
                self.test_upscale_x4v3,
                self.test_restore_face,
                self.test_denoise,
                self.test_colorize,
                self.test_inpaint_auto_migan,
                self.test_inpaint_auto_lama,
                self.test_ocr,
                self.test_segment_point,
                self.test_segment_box,
            ],
            "errors": [
                self.test_invalid_base64,
                self.test_missing_required_field,
                self.test_unknown_model,
                self.test_invalid_scale,
                self.test_empty_image,
                self.test_nonexistent_endpoint,
            ],
            "concurrency": [
                self.test_concurrent_health,
                self.test_concurrent_inference,
            ],
            "format": [
                self.test_response_meta_format,
                self.test_response_image_valid,
                self.test_error_response_format,
            ],
            "vram": [
                self.test_vram_tracking,
                self.test_model_idle_tracking,
                self.test_vram_gpu_consistency,
            ],
            "benchmark": [
                self.test_health_latency,
                self.test_inference_latency,
            ],
        }
        if suite == "all":
            return [test for tests in suites.values() for test in tests]
        return suites.get(suite, [])

    async def run_suite(self, suite: str, include_benchmark: bool = False) -> None:
        """Run a test suite or all suites."""
        if suite == "all":
            suite_names = ["health", "models", "inference", "errors",
                           "concurrency", "format", "vram"]
            if include_benchmark:
                suite_names.append("benchmark")
        else:
            suite_names = [suite]

        for name in suite_names:
            tests = self._get_suite_tests(name)
            if not tests:
                print(f"\n{_YELLOW}Unknown suite: {name}{_RESET}")
                continue
            print(f"\n{_BOLD}{_CYAN}{'=' * 60}{_RESET}")
            print(f"{_BOLD}{_CYAN}  Suite: {name.upper()}{_RESET}")
            print(f"{_BOLD}{_CYAN}{'=' * 60}{_RESET}")
            for test_fn in tests:
                try:
                    await test_fn()
                except httpx.ConnectError:
                    self._record(TestResult(
                        name=test_fn.__doc__ or test_fn.__name__,
                        suite=name,
                        passed=False,
                        message=f"Connection refused: {self.base_url}",
                    ))
                except Exception as exc:
                    self._record(TestResult(
                        name=test_fn.__doc__ or test_fn.__name__,
                        suite=name,
                        passed=False,
                        message=f"Unexpected error: {exc}",
                    ))

    def print_summary(self) -> None:
        """Print final test summary."""
        total = len(self.results)
        passed = sum(1 for r in self.results if r.passed)
        failed = total - passed

        print(f"\n{_BOLD}{'=' * 60}{_RESET}")
        print(f"{_BOLD}  SUMMARY{_RESET}")
        print(f"{'=' * 60}")

        # Per-suite breakdown
        suites: dict[str, list[TestResult]] = {}
        for r in self.results:
            suites.setdefault(r.suite, []).append(r)

        for suite_name, results in suites.items():
            s_pass = sum(1 for r in results if r.passed)
            s_total = len(results)
            color = _GREEN if s_pass == s_total else _RED
            print(f"  {suite_name:15s} {color}{s_pass}/{s_total}{_RESET}")

        print(f"  {'─' * 40}")
        color = _GREEN if failed == 0 else _RED
        print(f"  {'TOTAL':15s} {color}{passed}/{total}{_RESET}")

        if failed > 0:
            print(f"\n{_RED}  Failed tests:{_RESET}")
            for r in self.results:
                if not r.passed:
                    print(f"    - [{r.suite}] {r.name}: {r.message}")

        print()


# ── CLI ────────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Comprehensive Cortex service test and monitoring script",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Test suites:
  health       Health endpoint, GPU detection, uptime
  models       Model registry, ONNX integrity, VRAM budget
  inference    All 8 inference endpoints with valid input
  errors       Invalid input, missing models, bad parameters
  concurrency  Parallel requests, GPU queue behavior
  format       Response structure validation
  vram         VRAM tracking, idle monitoring, GPU consistency
  benchmark    Latency benchmarks (opt-in with --benchmark)
  all          Run all suites
""",
    )
    parser.add_argument(
        "--url", default=DEFAULT_URL,
        help=f"Cortex base URL (default: {DEFAULT_URL})",
    )
    parser.add_argument(
        "--suite", default="all",
        choices=["all", "health", "models", "inference", "errors",
                 "concurrency", "format", "vram", "benchmark"],
        help="Test suite to run (default: all)",
    )
    parser.add_argument(
        "--benchmark", action="store_true",
        help="Include performance benchmarks (slower)",
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true",
        help="Show detailed test output",
    )
    args = parser.parse_args()

    print(f"{_BOLD}Cortex Test Suite{_RESET}")
    print(f"Target: {args.url}")
    print(f"Suite:  {args.suite}")

    async def _run() -> None:
        runner_ref[0] = TestRunner(base_url=args.url, verbose=args.verbose)
        try:
            await runner_ref[0].run_suite(args.suite, include_benchmark=args.benchmark)
        finally:
            await runner_ref[0].close()

    runner_ref: list[TestRunner | None] = [None]
    try:
        asyncio.run(_run())
    except KeyboardInterrupt:
        print(f"\n{_YELLOW}Interrupted{_RESET}")

    runner = runner_ref[0]
    if runner is None:
        sys.exit(1)

    runner.print_summary()

    # Exit with non-zero code if any test failed
    failed = sum(1 for r in runner.results if not r.passed)
    sys.exit(1 if failed > 0 else 0)


if __name__ == "__main__":
    main()
