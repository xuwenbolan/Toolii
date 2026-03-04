#!/usr/bin/env python3
"""Comprehensive Cortex service test and monitoring script.

Test suites:
  health       Health endpoint, GPU detection, queue info, uptime
  models       Model registry, ONNX integrity, VRAM budget, events
  inference    All 8 inference endpoints with valid input
  errors       Invalid input, missing models, bad parameters
  concurrency  Parallel requests, GPU queue behavior
  format       Response structure validation
  vram         VRAM tracking, idle monitoring, GPU consistency
  benchmark    Latency benchmarks, load times, inference stats
  memory       Memory pressure: VRAM timeline, eviction, workspace
  profile      Isolated per-model VRAM profiling

Usage:
  uv run scripts/test_cortex.py                     # interactive TUI menu
  uv run scripts/test_cortex.py quick               # health + models + inference
  uv run scripts/test_cortex.py standard            # all core suites
  uv run scripts/test_cortex.py benchmark           # standard + performance
  uv run scripts/test_cortex.py stress              # standard + memory pressure
  uv run scripts/test_cortex.py profile             # isolated VRAM profiling
  uv run scripts/test_cortex.py full                # everything
  uv run scripts/test_cortex.py health              # single suite
  uv run scripts/test_cortex.py health inference    # multiple suites
  uv run scripts/test_cortex.py --url http://host:9100 quick
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import io
import sys
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx
import numpy as np
from PIL import Image
from rich.console import Console, Group
from rich.live import Live
from rich.panel import Panel
from rich.progress import BarColumn, Progress, SpinnerColumn, TextColumn, TimeElapsedColumn
from rich.table import Table
from rich.text import Text

# ── Constants ──────────────────────────────────────────────────────────

DEFAULT_URL = "http://localhost:9100"
TIMEOUT = httpx.Timeout(connect=5.0, read=120.0, write=30.0, pool=10.0)

ENDPOINTS = [
    "remove-background", "upscale", "restore-face", "denoise",
    "colorize", "inpaint", "ocr", "segment",
]

REPORT_PATH = Path(__file__).resolve().parent.parent / "test_report.txt"

ALL_SUITES = [
    "health", "models", "inference", "errors",
    "concurrency", "format", "vram",
]

# Preset name -> (description, suite list)
PRESETS: dict[str, tuple[str, list[str]]] = {
    "quick":     ("health + models + inference",
                  ["health", "models", "inference"]),
    "standard":  ("all core suites",
                  ALL_SUITES),
    "benchmark": ("standard + performance benchmarks",
                  [*ALL_SUITES, "benchmark"]),
    "stress":    ("standard + memory pressure tests",
                  [*ALL_SUITES, "vram", "memory"]),
    "profile":   ("isolated per-model VRAM profiling",
                  ["profile"]),
    "full":      ("everything",
                  [*ALL_SUITES, "benchmark", "vram", "memory", "profile"]),
}

SUITE_NAMES = {
    *ALL_SUITES, "benchmark", "memory", "profile",
}

console = Console(record=True)


def _read_key() -> str:
    """Read a single keypress in raw terminal mode.

    Uses os.read on the raw fd (not sys.stdin) so that select() and read()
    operate on the same unbuffered layer.
    """
    import os
    import select
    import termios
    import tty

    fd = sys.stdin.fileno()
    old = termios.tcgetattr(fd)
    try:
        tty.setraw(fd)
        ch = os.read(fd, 1).decode()
        if ch == "\x1b":
            if select.select([fd], [], [], 0.05)[0]:
                seq = os.read(fd, 2).decode()
                return {"[A": "up", "[B": "down"}.get(seq, "escape")
            return "escape"
        if ch in ("\r", "\n"):
            return "enter"
        if ch == "\x03":
            return "ctrl-c"
        return ch
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old)


def _build_menu(items: list[tuple[str, tuple[str, list[str]]]],
                selected: int, url: str) -> Panel:
    """Build a Rich Panel for the TUI menu with current selection highlighted."""
    table = Table(
        show_header=False, border_style="dim", pad_edge=False,
        expand=True, show_edge=False,
    )
    table.add_column("Arrow", width=3)
    table.add_column("Name", width=12)
    table.add_column("Description")

    for i, (name, (desc, _)) in enumerate(items):
        if i == selected:
            table.add_row(
                Text(">", style="bold cyan"),
                Text(name, style="bold cyan"),
                Text(desc, style="cyan"),
            )
        else:
            table.add_row(
                Text(" "),
                Text(name, style="dim"),
                Text(desc, style="dim"),
            )

    return Panel(
        Group(table, Text("\n  Up/Down to move, Enter to select, q to quit", style="dim")),
        title=f"Cortex Test Suite  [dim]({url})[/]",
        border_style="bold cyan",
        padding=(1, 2),
    )


def _show_tui_menu(url: str) -> list[str]:
    """Show interactive TUI menu with arrow key navigation."""
    menu_items = list(PRESETS.items())
    selected = 1  # default: standard
    n = len(menu_items)

    try:
        with Live(
            _build_menu(menu_items, selected, url),
            console=console,
            auto_refresh=False,
            transient=True,
        ) as live:
            while True:
                key = _read_key()
                if key == "up":
                    selected = (selected - 1) % n
                elif key == "down":
                    selected = (selected + 1) % n
                elif key == "enter":
                    break
                elif key in ("ctrl-c", "q", "Q", "escape"):
                    live.stop()
                    console.print("[dim]Cancelled[/]")
                    sys.exit(0)
                elif key.isdigit() and 1 <= int(key) <= n:
                    selected = int(key) - 1
                    break
                else:
                    continue
                live.update(_build_menu(menu_items, selected, url))
                live.refresh()
    except (KeyboardInterrupt, EOFError):
        console.print("[dim]Cancelled[/]")
        sys.exit(0)

    preset_name, (desc, suites) = menu_items[selected]
    console.print(f"  [bold cyan]>[/] [bold]{preset_name}[/]  [dim]{desc}[/]\n")
    return suites


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


def _make_mask_image(width: int = 256, height: int = 256, fill_ratio: float = 0.05) -> str:
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


def _status_text(passed: bool) -> Text:
    if passed:
        return Text("PASS", style="bold green")
    return Text("FAIL", style="bold red")


def _time_style(ms: int) -> str:
    if ms > 10000:
        return "bold red"
    if ms > 2000:
        return "yellow"
    return "dim"


class TestRunner:
    """Collects and runs test cases, displays results with Rich TUI."""

    def __init__(self, base_url: str, verbose: bool = False) -> None:
        self.base_url = base_url.rstrip("/")
        self.verbose = verbose
        self.results: list[TestResult] = []
        self.client = httpx.AsyncClient(base_url=self.base_url, timeout=TIMEOUT)
        self._suite_start: float = 0.0
        self._suite_times: dict[str, float] = {}
        # Pre-generate test images (reuse across tests)
        self._rgb_b64 = _make_rgb_image()
        self._gray_b64 = _make_grayscale_image()
        self._text_b64 = _make_text_image()
        self._small_mask_b64 = _make_mask_image(fill_ratio=0.05)
        self._large_mask_b64 = _make_large_mask()

    async def close(self) -> None:
        await self.client.aclose()

    # Suites that require a clean VRAM state (all models unloaded) before running
    _CLEAN_VRAM_SUITES = {"memory", "profile", "vram"}

    async def _ensure_clean_vram(self, suite_name: str) -> None:
        """Unload all models and wait for CUDA cleanup before state-sensitive suites."""
        if suite_name not in self._CLEAN_VRAM_SUITES:
            return
        try:
            resp = await self.client.post("/admin/unload-all")
            if resp.status_code == 200:
                await asyncio.sleep(1.5)  # CUDA memory cleanup
                if self.verbose:
                    console.print(f"  [dim]Suite isolation: unloaded all models before {suite_name}[/]")
        except Exception:
            pass  # best-effort; suite tests will catch real problems

    def _record(self, result: TestResult) -> None:
        self.results.append(result)

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
                    "queue": body.get("queue", {}),
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
        base_fields = ("name", "vram_total_mb", "vram_used_mb", "vram_free_mb")
        extended_fields = ("gpu_utilization_pct", "driver_version", "cuda_version",
                           "temperature_c", "power_watts")
        has_base = all(k in gpu for k in base_fields)
        has_extended = all(k in gpu for k in extended_fields)
        has_real_gpu = gpu.get("name", "unknown") != "unknown" and gpu.get("vram_total_mb", 0) > 0
        self._record(TestResult(
            name="GPU base fields present",
            suite="health",
            passed=has_base,
            elapsed_ms=elapsed,
            message="" if has_base else f"Missing GPU fields: {gpu}",
            details={"gpu": gpu},
        ))
        self._record(TestResult(
            name="GPU extended fields present",
            suite="health",
            passed=has_extended,
            elapsed_ms=0,
            message="" if has_extended else "Missing extended fields",
            details={"extended_fields": {k: gpu.get(k) for k in extended_fields}},
        ))
        self._record(TestResult(
            name="GPU detected (pynvml)",
            suite="health",
            passed=has_real_gpu,
            elapsed_ms=0,
            message="" if has_real_gpu else f"No GPU detected: {gpu.get('name')}",
            details={"gpu": gpu},
        ))

    async def test_health_queue_info(self) -> None:
        """Verify queue info is present in /health response."""
        _, body, elapsed = await self._get("/health")
        queue = body.get("queue", {})
        has_fields = all(k in queue for k in ("max_concurrent", "active", "timeout_seconds"))
        self._record(TestResult(
            name="Queue info present",
            suite="health",
            passed=has_fields,
            elapsed_ms=elapsed,
            message="" if has_fields else f"Missing queue fields: {queue}",
            details={"queue": queue},
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
        used = summary.get("vram_real_mb", 0)
        budget = summary.get("vram_budget_mb", 0)
        ok = budget > 0 and used <= budget
        self._record(TestResult(
            name="VRAM within budget",
            suite="models",
            passed=ok,
            message="" if ok else f"VRAM over budget: {used}MB / {budget}MB",
            details={"vram_real_mb": used, "vram_budget_mb": budget,
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

    async def test_model_loaded_fields(self) -> None:
        """Verify loaded models have extended tracking fields."""
        # Ensure at least one model is loaded
        await self._post("remove-background", {"image_b64": self._rgb_b64})
        _, body, _ = await self._get("/models")
        loaded = [m for m in body.get("models", []) if m.get("status") == "loaded"]
        extended_fields = {"loaded_at", "load_time_ms", "vram_delta_mb", "idle_seconds"}
        bad = []
        for m in loaded:
            missing = extended_fields - set(m.keys())
            if missing:
                bad.append(f"{m.get('name', '?')}: missing {missing}")
        ok = len(loaded) > 0 and len(bad) == 0
        self._record(TestResult(
            name="Loaded models have tracking fields",
            suite="models",
            passed=ok,
            message="" if ok else "; ".join(bad[:3]),
            details={
                "loaded_count": len(loaded),
                "sample": {m["name"]: {
                    "load_time_ms": m.get("load_time_ms"),
                    "vram_delta_mb": m.get("vram_delta_mb"),
                } for m in loaded[:3]},
            },
        ))

    async def test_model_events(self) -> None:
        """Verify event log is present in /models response."""
        _, body, _ = await self._get("/models")
        events = body.get("events", [])
        ok = isinstance(events, list)
        self._record(TestResult(
            name="Event log present in /models",
            suite="models",
            passed=ok,
            message=f"{len(events)} events recorded",
            details={"event_count": len(events), "recent": events[-3:] if events else []},
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

    async def test_remove_background_mask(self) -> None:
        """POST /v1/remove-background with output_type=mask."""
        code, body, elapsed = await self._post("remove-background", {
            "image_b64": self._rgb_b64,
            "output_type": "mask",
        })
        ok = code == 200 and "image_b64" in body
        if ok:
            img = _decode_b64_image(body["image_b64"])
            ok = ok and img.mode == "L"  # grayscale alpha matte
        self._record(TestResult(
            name="remove-background (mask output)",
            suite="inference",
            passed=ok,
            elapsed_ms=elapsed,
            message="" if ok else f"code={code}",
        ))

    async def test_upscale(self) -> None:
        """POST /v1/upscale with x4plus model."""
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
            "points": [[128.0, 128.0, 1.0]],
        })
        ok = code == 200 and "masks" in body and "meta" in body
        meta = body.get("meta", {})
        self._record(TestResult(
            name="segment (point prompt)",
            suite="inference",
            passed=ok,
            elapsed_ms=elapsed,
            message="" if ok else f"code={code}, error={body.get('error', '')}",
            details={"meta": meta, "masks_count": meta.get("masks_count", 0)},
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
        ok = code >= 400
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
        ok = code == 422
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
            message="" if ok else f"Got code={code}, body={body.get('error', {})}",
        ))

    async def test_invalid_scale(self) -> None:
        """Send an invalid scale parameter to upscale."""
        small_b64 = _make_rgb_image(32, 32)
        code, body, elapsed = await self._post("upscale", {
            "image_b64": small_b64,
            "scale": 8,
        })
        is_error = code >= 400
        self._record(TestResult(
            name="Invalid scale parameter handled",
            suite="errors",
            passed=True,  # pass if no server crash
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
        self._record(TestResult(
            name="1x1 image does not crash server",
            suite="errors",
            passed=True,
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
        ok = avg < 100
        self._record(TestResult(
            name="Health latency benchmark",
            suite="benchmark",
            passed=ok,
            elapsed_ms=int(avg),
            message=f"avg={avg:.0f}ms, p99={p99}ms, min={min(times)}ms, max={max(times)}ms",
            details={"avg_ms": avg, "p99_ms": p99, "min_ms": min(times), "max_ms": max(times)},
        ))

    async def test_inference_latency(self) -> None:
        """Benchmark each inference endpoint latency (warm-up + measured call)."""
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

    async def test_per_model_load_time(self) -> None:
        """Report load time for each currently loaded model."""
        _, body, _ = await self._get("/models")
        loaded = [m for m in body.get("models", []) if m.get("status") == "loaded"]
        if not loaded:
            self._record(TestResult(
                name="Per-model load time", suite="benchmark", passed=True,
                message="No loaded models to report",
            ))
            return
        for m in loaded:
            self._record(TestResult(
                name=f"Load time: {m['name']}",
                suite="benchmark",
                passed=True,
                elapsed_ms=m.get("load_time_ms", 0),
                message=f"load={m.get('load_time_ms', '?')}ms, vram_delta={m.get('vram_delta_mb', '?')}MB",
                details={
                    "model": m["name"],
                    "load_time_ms": m.get("load_time_ms"),
                    "vram_delta_mb": m.get("vram_delta_mb"),
                    "vram_estimated_mb": m.get("vram_mb"),
                },
            ))

    async def test_inference_stats(self) -> None:
        """Report per-endpoint inference statistics from /stats."""
        code, body, elapsed = await self._get("/stats")
        ok = code == 200 and "inference" in body
        stats = body.get("inference", {})
        self._record(TestResult(
            name="Inference statistics from /stats",
            suite="benchmark",
            passed=ok,
            elapsed_ms=elapsed,
            message=f"{len(stats)} endpoints tracked",
            details={"stats": stats},
        ))

    # ── Suite: VRAM Monitoring ─────────────────────────────────────────

    async def test_vram_tracking(self) -> None:
        """Monitor VRAM usage before and after inference calls."""
        _, before, _ = await self._get("/models")
        before_summary = before.get("summary", {})

        await self._post("remove-background", {"image_b64": self._rgb_b64})

        _, after, _ = await self._get("/models")
        after_summary = after.get("summary", {})

        before_loaded = before_summary.get("loaded", 0)
        after_loaded = after_summary.get("loaded", 0)
        vram_used = after_summary.get("vram_real_mb", 0)
        vram_budget = after_summary.get("vram_budget_mb", 0)

        # Allow 5% tolerance: vram_real_mb includes CUDA context/driver overhead
        tolerance = max(500, int(vram_budget * 0.05))
        ok = vram_used <= vram_budget + tolerance
        self._record(TestResult(
            name="VRAM tracking after inference",
            suite="vram",
            passed=ok,
            message=f"loaded: {before_loaded} -> {after_loaded}, VRAM: {vram_used}/{vram_budget}MB (+{tolerance}MB tolerance)",
            details={
                "before_loaded": before_loaded,
                "after_loaded": after_loaded,
                "vram_real_mb": vram_used,
                "vram_budget_mb": vram_budget,
                "utilization": after_summary.get("vram_utilization"),
            },
        ))

    async def test_model_idle_tracking(self) -> None:
        """Verify idle_seconds is tracked for loaded models."""
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
        """Cross-check estimated VRAM vs pynvml reported VRAM."""
        _, health, _ = await self._get("/health")
        _, models, _ = await self._get("/models")

        gpu_used = health.get("gpu", {}).get("vram_used_mb", 0)
        estimated = models.get("summary", {}).get("vram_estimated_mb", 0)
        real = models.get("summary", {}).get("vram_real_mb", 0)

        ok = True  # informational, always pass
        self._record(TestResult(
            name="VRAM: pynvml vs estimated vs real",
            suite="vram",
            passed=ok,
            message=f"pynvml={gpu_used}MB, estimated={estimated}MB, real={real}MB",
            details={
                "pynvml_used_mb": gpu_used,
                "model_estimated_mb": estimated,
                "model_real_mb": real,
                "delta_pynvml_estimated_mb": gpu_used - estimated,
            },
        ))

    async def test_vram_per_model_delta(self) -> None:
        """Report per-model VRAM delta (estimated vs measured) for loaded models."""
        await self._post("remove-background", {"image_b64": self._rgb_b64})
        _, body, _ = await self._get("/models")
        loaded = [m for m in body.get("models", []) if m.get("status") == "loaded"]

        for m in loaded:
            est = m.get("vram_mb", 0)
            delta = m.get("vram_delta_mb", 0)
            ratio = round(delta / est, 2) if est > 0 else 0
            self._record(TestResult(
                name=f"VRAM delta: {m['name']}",
                suite="vram",
                passed=True,  # informational
                message=f"estimated={est}MB, real_delta={delta}MB, ratio={ratio}x",
                details={
                    "model": m["name"],
                    "vram_estimated_mb": est,
                    "vram_delta_mb": delta,
                    "ratio": ratio,
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

        # Validate meta.gpu sub-fields
        meta_gpu = meta.get("gpu", {})
        gpu_keys = {"inference_ms", "vram_before_mb", "vram_after_mb",
                     "gpu_utilization_pct", "temperature_c", "power_watts"}
        gpu_missing = gpu_keys - set(meta_gpu.keys())
        gpu_ok = len(gpu_missing) == 0
        self._record(TestResult(
            name="Response meta.gpu has profiling fields",
            suite="format",
            passed=gpu_ok,
            message="" if gpu_ok else f"Missing gpu keys: {gpu_missing}",
            details={"gpu": meta_gpu, "missing": list(gpu_missing)},
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
        except Exception:
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

    # ── Suite: Memory Pressure (stress) ─────────────────────────────────

    async def _query_vram_snapshot(self) -> dict[str, Any]:
        """Query /models and /health to get a VRAM snapshot."""
        _, models, _ = await self._get("/models")
        summary = models.get("summary", {})
        return {
            "vram_real_mb": summary.get("vram_real_mb", 0),
            "vram_estimated_mb": summary.get("vram_estimated_mb", 0),
            "vram_budget_mb": summary.get("vram_budget_mb", 0),
            "loaded": summary.get("loaded", 0),
            "loaded_names": [
                m["name"] for m in models.get("models", [])
                if m.get("status") == "loaded"
            ],
        }

    async def test_memory_pressure_timeline(self) -> None:
        """Core memory management test: load all endpoints sequentially,
        track VRAM at every step, verify budget never exceeded.

        Produces a VRAM timeline chart showing real VRAM vs budget line.
        """
        all_payloads: list[tuple[str, dict]] = [
            ("remove-background", {"image_b64": self._rgb_b64}),
            ("upscale", {"image_b64": _make_rgb_image(64, 64), "scale": 4}),
            ("restore-face", {"image_b64": self._rgb_b64}),
            ("denoise", {"image_b64": self._rgb_b64}),
            ("colorize", {"image_b64": self._gray_b64}),
            ("inpaint", {"image_b64": self._rgb_b64, "mask_b64": self._small_mask_b64}),
            ("ocr", {"image_b64": self._text_b64}),
            ("segment", {"image_b64": self._rgb_b64, "points": [[128.0, 128.0, 1.0]]}),
        ]

        # Record baseline before any load
        baseline = await self._query_vram_snapshot()
        budget = baseline["vram_budget_mb"]

        timeline: list[dict[str, Any]] = [{
            "step": "baseline",
            "vram_real_mb": baseline["vram_real_mb"],
            "loaded": baseline["loaded"],
            "loaded_names": baseline["loaded_names"],
            "http_code": 0,
        }]

        peak_vram = baseline["vram_real_mb"]
        budget_exceeded_steps: list[str] = []

        for endpoint, payload in all_payloads:
            code, _, elapsed = await self._post(endpoint, payload)
            snap = await self._query_vram_snapshot()

            step_data = {
                "step": endpoint,
                "vram_real_mb": snap["vram_real_mb"],
                "loaded": snap["loaded"],
                "loaded_names": snap["loaded_names"],
                "http_code": code,
                "elapsed_ms": elapsed,
            }
            timeline.append(step_data)

            if snap["vram_real_mb"] > peak_vram:
                peak_vram = snap["vram_real_mb"]
            # 10% tolerance for measurement noise
            if budget > 0 and snap["vram_real_mb"] > budget * 1.1:
                budget_exceeded_steps.append(
                    f"{endpoint}: {snap['vram_real_mb']}MB > {budget}MB"
                )

        ok = len(budget_exceeded_steps) == 0
        # Store timeline for chart rendering
        self._memory_timeline = timeline
        self._memory_budget = budget
        self._memory_peak = peak_vram

        self._record(TestResult(
            name="VRAM timeline: budget never exceeded",
            suite="memory",
            passed=ok,
            message=(f"peak={peak_vram}MB, budget={budget}MB, "
                     f"breaches={len(budget_exceeded_steps)}")
                    if ok else
                    f"BUDGET EXCEEDED at: {'; '.join(budget_exceeded_steps)}",
            details={
                "peak_vram_mb": peak_vram,
                "budget_mb": budget,
                "baseline_vram_mb": baseline["vram_real_mb"],
                "steps": len(timeline),
                "breaches": budget_exceeded_steps,
            },
        ))

    async def test_memory_eviction_triggered(self) -> None:
        """Verify that eviction events were triggered during the pressure test."""
        _, body, _ = await self._get("/models")
        events = body.get("events", [])
        load_events = [e for e in events if e.get("event") == "loaded"]
        evict_events = [e for e in events if "evict" in e.get("event", "")]
        oom_events = [e for e in events if e.get("event") == "oom_retry"]

        # Store events for chart rendering
        self._memory_events = events

        self._record(TestResult(
            name="Eviction triggered during pressure test",
            suite="memory",
            passed=len(load_events) > 0,
            message=(f"{len(load_events)} loads, {len(evict_events)} evictions, "
                     f"{len(oom_events)} OOM retries"),
            details={
                "total_events": len(events),
                "load_events": len(load_events),
                "evict_events": len(evict_events),
                "oom_events": len(oom_events),
                "all_events": events,
            },
        ))

    async def test_memory_vram_accuracy(self) -> None:
        """Compare estimated vs real VRAM delta for every loaded model."""
        _, body, _ = await self._get("/models")
        loaded = [m for m in body.get("models", [])
                  if m.get("status") == "loaded" and m.get("vram_delta_mb") is not None]

        # Store for accuracy table rendering
        self._vram_accuracy_data = loaded

        if not loaded:
            self._record(TestResult(
                name="Per-model VRAM accuracy", suite="memory", passed=True,
                message="No loaded models with VRAM delta data",
            ))
            return

        for m in loaded:
            est = m.get("vram_mb", 0)
            delta = m.get("vram_delta_mb", 0)
            ratio = round(delta / est, 2) if est > 0 else 0
            diff = delta - est
            sign = "+" if diff >= 0 else ""
            self._record(TestResult(
                name=f"VRAM accuracy: {m['name']}",
                suite="memory",
                passed=True,  # informational
                message=f"est={est}MB, real={delta}MB, {sign}{diff}MB ({ratio}x)",
                details={
                    "model": m["name"],
                    "estimated_mb": est,
                    "real_delta_mb": delta,
                    "diff_mb": diff,
                    "ratio": ratio,
                    "file_size_mb": m.get("file_size_mb"),
                    "load_time_ms": m.get("load_time_ms"),
                },
            ))

    async def test_memory_rapid_cycling(self) -> None:
        """Rapid cycling: 20 sequential requests across endpoints.
        Verify no 500 errors and VRAM stays within budget throughout.
        """
        endpoints_payloads: list[tuple[str, dict]] = [
            ("remove-background", {"image_b64": self._rgb_b64}),
            ("denoise", {"image_b64": self._rgb_b64}),
            ("colorize", {"image_b64": self._gray_b64}),
            ("ocr", {"image_b64": self._text_b64}),
        ]
        errors_500 = 0
        total = 20
        peak_vram = 0

        for i in range(total):
            ep, payload = endpoints_payloads[i % len(endpoints_payloads)]
            code, _, _ = await self._post(ep, payload)
            if code == 500:
                errors_500 += 1

            # Sample VRAM every 5 requests
            if (i + 1) % 5 == 0:
                snap = await self._query_vram_snapshot()
                if snap["vram_real_mb"] > peak_vram:
                    peak_vram = snap["vram_real_mb"]

        # Final check
        snap = await self._query_vram_snapshot()
        if snap["vram_real_mb"] > peak_vram:
            peak_vram = snap["vram_real_mb"]
        budget = snap["vram_budget_mb"]

        ok = errors_500 == 0 and (budget == 0 or peak_vram <= budget * 1.1)
        self._record(TestResult(
            name="Rapid cycling: 20 requests stable",
            suite="memory",
            passed=ok,
            message=(f"{errors_500} errors, peak={peak_vram}MB, "
                     f"budget={budget}MB, loaded={snap['loaded']}"),
            details={
                "total_requests": total,
                "errors_500": errors_500,
                "peak_vram_mb": peak_vram,
                "final_loaded": snap["loaded"],
                "final_vram_mb": snap["vram_real_mb"],
            },
        ))

    async def test_memory_concurrent_pressure(self) -> None:
        """Fire concurrent requests to different endpoints simultaneously.
        Verify no crashes and VRAM is managed correctly under concurrency.
        """
        small_b64 = _make_rgb_image(64, 64)

        # 3 rounds of concurrent requests
        errors_500 = 0
        for _ in range(3):
            tasks = [
                self._post("remove-background", {"image_b64": small_b64}),
                self._post("denoise", {"image_b64": small_b64}),
                self._post("colorize", {"image_b64": self._gray_b64}),
                self._post("ocr", {"image_b64": self._text_b64}),
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for r in results:
                if isinstance(r, Exception):
                    errors_500 += 1
                elif r[0] == 500:
                    errors_500 += 1

        snap = await self._query_vram_snapshot()
        budget = snap["vram_budget_mb"]
        vram = snap["vram_real_mb"]
        ok = errors_500 == 0 and (budget == 0 or vram <= budget * 1.1)

        self._record(TestResult(
            name="Concurrent pressure: 3x4 parallel requests",
            suite="memory",
            passed=ok,
            message=f"{errors_500} errors, VRAM={vram}MB/{budget}MB, loaded={snap['loaded']}",
            details={
                "total_rounds": 3,
                "parallel_per_round": 4,
                "errors": errors_500,
                "final_vram_mb": vram,
                "budget_mb": budget,
            },
        ))

    async def test_memory_shared_memory_check(self) -> None:
        """Verify shared_memory_warning field in /health."""
        _, body, elapsed = await self._get("/health")
        warning = body.get("shared_memory_warning")
        ok = warning is not None  # field exists
        self._record(TestResult(
            name="shared_memory_warning in /health",
            suite="memory",
            passed=ok,
            elapsed_ms=elapsed,
            message=f"shared_memory_warning={warning}",
            details={"shared_memory_warning": warning},
        ))

    async def test_memory_timeline_api(self) -> None:
        """Verify /stats/timeline returns samples."""
        code, body, elapsed = await self._get("/stats/timeline?last=30")
        samples = body.get("samples", [])
        has_shared = "shared_memory_detected" in body
        ok = code == 200 and has_shared
        self._record(TestResult(
            name="Timeline API (/stats/timeline)",
            suite="memory",
            passed=ok,
            elapsed_ms=elapsed,
            message=f"{len(samples)} samples, shared_memory={body.get('shared_memory_detected')}",
            details={
                "sample_count": len(samples),
                "shared_memory_detected": body.get("shared_memory_detected"),
                "latest_sample": samples[-1] if samples else None,
            },
        ))

    async def test_memory_workspace_tracked(self) -> None:
        """Verify workspace_measured_mb is populated after inference."""
        # Trigger inference
        await self._post("remove-background", {"image_b64": self._rgb_b64})
        _, body, _ = await self._get("/models")
        loaded = [m for m in body.get("models", []) if m.get("status") == "loaded"]

        has_workspace = [
            m for m in loaded
            if m.get("workspace_measured_mb") is not None and m.get("workspace_measured_mb", 0) >= 0
        ]
        ok = len(has_workspace) > 0
        self._record(TestResult(
            name="workspace_measured_mb tracked after inference",
            suite="memory",
            passed=ok,
            message=f"{len(has_workspace)}/{len(loaded)} models have workspace data",
            details={
                "models": [
                    {"name": m["name"],
                     "workspace_mb": m.get("workspace_mb"),
                     "workspace_measured_mb": m.get("workspace_measured_mb"),
                     "inference_count": m.get("inference_count")}
                    for m in loaded
                ],
            },
        ))

    # ── Suite: Profile (isolated per-model VRAM profiling) ────────────

    async def _profile_endpoint(
        self,
        endpoint: str,
        payload: dict,
        label: str,
    ) -> dict[str, Any]:
        """Profile a single endpoint: unload all, measure baseline, infer, measure."""
        # Unload all models
        resp = await self.client.post("/admin/unload-all")
        if resp.status_code != 200:
            return {"error": f"unload-all failed: {resp.status_code}"}

        # Wait for CUDA memory cleanup
        await asyncio.sleep(2.0)

        # Record baseline
        _, health, _ = await self._get("/health")
        gpu_info = health.get("gpu", {})
        baseline_vram = gpu_info.get("vram_used_mb", 0)
        baseline_system_ram = 0
        # Try to get system RAM from timeline samples
        _, tl, _ = await self._get("/stats/timeline?last=1")
        samples = tl.get("samples", [])
        if samples:
            baseline_system_ram = samples[-1].get("system_ram_used_mb", 0)

        # Start background VRAM sampler
        vram_samples: list[dict] = []
        sampling = True

        async def _sampler():
            while sampling:
                try:
                    _, h, _ = await self._get("/health")
                    vram_samples.append({
                        "timestamp": time.time(),
                        "vram_used_mb": h.get("gpu", {}).get("vram_used_mb", 0),
                    })
                except Exception:
                    pass
                await asyncio.sleep(0.1)

        sampler_task = asyncio.create_task(_sampler())

        # Run inference
        t0 = time.perf_counter()
        resp_body: dict = {}
        try:
            code, resp_body, _ = await self._post(endpoint, payload)
        except httpx.TimeoutException:
            code = 504
        roundtrip_ms = int((time.perf_counter() - t0) * 1000)

        # Stop sampler
        sampling = False
        await sampler_task

        # Record post-inference state
        _, health_after, _ = await self._get("/health")
        _, tl_after, _ = await self._get("/stats/timeline?last=1")
        after_vram = health_after.get("gpu", {}).get("vram_used_mb", 0)
        after_system_ram = 0
        after_samples = tl_after.get("samples", [])
        if after_samples:
            after_system_ram = after_samples[-1].get("system_ram_used_mb", 0)

        # Get actual model load delta from /models API (measured at load time)
        _, models_data, _ = await self._get("/models")
        model_load_delta = 0
        for m in models_data.get("models", []):
            if m.get("status") == "loaded" and m.get("vram_delta_mb"):
                model_load_delta += m["vram_delta_mb"]

        # Compute VRAM metrics using real load delta
        peak_vram = max((s["vram_used_mb"] for s in vram_samples), default=after_vram)
        load_mb = model_load_delta if model_load_delta > 0 else max(0, after_vram - baseline_vram)
        workspace_peak_mb = peak_vram - baseline_vram - load_mb
        workspace_retained_mb = after_vram - baseline_vram - load_mb
        system_ram_delta = after_system_ram - baseline_system_ram
        vram_total = gpu_info.get("vram_total_mb", 0)
        shared_memory = (
            (vram_total > 0 and peak_vram >= vram_total * 0.98)
            or system_ram_delta > 500
        )

        # Extract server-side GPU profile from response meta
        meta_gpu = resp_body.get("meta", {}).get("gpu", {})

        return {
            "label": label,
            "endpoint": endpoint,
            "http_code": code,
            "roundtrip_ms": roundtrip_ms,
            "inference_ms": meta_gpu.get("inference_ms", 0),
            "baseline_vram_mb": baseline_vram,
            "load_vram_mb": load_mb,
            "peak_vram_mb": peak_vram,
            "after_vram_mb": after_vram,
            "workspace_peak_mb": max(0, workspace_peak_mb),
            "workspace_retained_mb": max(0, workspace_retained_mb),
            "baseline_system_ram_mb": baseline_system_ram,
            "after_system_ram_mb": after_system_ram,
            "system_ram_delta_mb": system_ram_delta,
            "shared_memory_detected": shared_memory,
            "vram_samples": len(vram_samples),
            "gpu_utilization_pct": meta_gpu.get("gpu_utilization_pct"),
            "temperature_c": meta_gpu.get("temperature_c"),
            "power_watts": meta_gpu.get("power_watts"),
        }

    async def test_profile_all_endpoints(self) -> None:
        """Profile each endpoint in isolation to measure VRAM usage."""
        profile_payloads: list[tuple[str, dict, str]] = [
            ("remove-background", {"image_b64": self._rgb_b64}, "birefnet-general"),
            ("upscale", {"image_b64": _make_rgb_image(64, 64), "scale": 4}, "realesrgan-x4plus"),
            ("restore-face", {"image_b64": self._rgb_b64}, "gfpgan-v1.4"),
            ("denoise", {"image_b64": self._rgb_b64}, "nafnet-sidd-w64"),
            ("colorize", {"image_b64": self._gray_b64}, "ddcolor-artistic"),
            ("inpaint", {"image_b64": self._rgb_b64, "mask_b64": self._small_mask_b64}, "migan"),
            ("inpaint", {"image_b64": self._rgb_b64, "mask_b64": self._large_mask_b64,
                         "model": "lama"}, "lama"),
            ("segment", {"image_b64": self._rgb_b64, "points": [[128.0, 128.0, 1.0]]},
             "mobilesam-encoder"),
        ]

        profile_results: list[dict] = []

        for endpoint, payload, label in profile_payloads:
            try:
                profile = await self._profile_endpoint(endpoint, payload, label)
            except Exception as exc:
                profile = {"label": label, "endpoint": endpoint,
                           "http_code": 0, "error": str(exc)}

            profile_results.append(profile)

            ok = profile.get("http_code") == 200
            shared = profile.get("shared_memory_detected", False)
            error_msg = profile.get("error", "")
            gpu_info_msg = ""
            if not error_msg:
                gpu_util = profile.get("gpu_utilization_pct")
                if gpu_util is not None:
                    gpu_info_msg = f", GPU={gpu_util}%"
                temp = profile.get("temperature_c")
                if temp is not None:
                    gpu_info_msg += f", {temp}C"
                power = profile.get("power_watts")
                if power is not None:
                    gpu_info_msg += f", {power}W"
            self._record(TestResult(
                name=f"Profile: {label}",
                suite="profile",
                passed=ok,
                elapsed_ms=profile.get("roundtrip_ms", 0),
                message=(
                    error_msg if error_msg else
                    f"infer={profile.get('inference_ms', '?')}ms, "
                    f"load={profile.get('load_vram_mb')}MB, "
                    f"peak={profile.get('peak_vram_mb')}MB, "
                    f"ws={profile.get('workspace_peak_mb')}MB"
                    + gpu_info_msg
                    + (" SHARED!" if shared else "")
                ),
                details=profile,
            ))

        # Store for table rendering and saving
        self._profile_results = profile_results

    async def test_profile_save(self) -> None:
        """Save profile results via /admin/save-profile API."""
        results = getattr(self, "_profile_results", [])
        if not results:
            self._record(TestResult(
                name="Save profile", suite="profile", passed=False,
                message="No profile results to save",
            ))
            return

        # Build profile JSON
        profile_data = {}
        for r in results:
            label = r.get("label", "")
            if label and r.get("http_code") == 200:
                profile_data[label] = {
                    "load_vram_mb": r.get("load_vram_mb", 0),
                    "workspace_peak_mb": r.get("workspace_peak_mb", 0),
                    "workspace_retained_mb": r.get("workspace_retained_mb", 0),
                    "shared_memory_detected": r.get("shared_memory_detected", False),
                    "inference_ms": r.get("inference_ms", 0),
                    "roundtrip_ms": r.get("roundtrip_ms", 0),
                    "gpu_utilization_pct": r.get("gpu_utilization_pct"),
                    "temperature_c": r.get("temperature_c"),
                    "power_watts": r.get("power_watts"),
                }

        # Save via server API (server knows the correct path)
        try:
            resp = await self.client.post("/admin/save-profile", json=profile_data)
            body = resp.json()
            ok = resp.status_code == 200 and body.get("status") == "ok"
            msg = (f"Saved {body.get('models', 0)} models to {body.get('path', '?')}"
                   if ok else f"Server error: {body.get('message', resp.text)}")
        except Exception as exc:
            ok = False
            msg = f"Failed to save: {exc}"

        self._record(TestResult(
            name="Save VRAM profile",
            suite="profile",
            passed=ok,
            message=msg,
            details={"models": list(profile_data.keys())},
        ))

    # ── Suite runner ───────────────────────────────────────────────────

    def _get_suite_tests(self, suite: str) -> list[Callable]:
        """Return test methods for a given suite name."""
        suites: dict[str, list[Callable]] = {
            "health": [
                self.test_health_endpoint,
                self.test_health_gpu_info,
                self.test_health_queue_info,
                self.test_uptime,
            ],
            "models": [
                self.test_models_detail,
                self.test_models_vram_budget,
                self.test_models_check_all,
                self.test_model_status_fields,
                self.test_model_loaded_fields,
                self.test_model_events,
                self.test_model_check_single,
                self.test_model_check_unknown,
            ],
            "inference": [
                self.test_remove_background,
                self.test_remove_background_mask,
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
                self.test_vram_per_model_delta,
            ],
            "benchmark": [
                self.test_health_latency,
                self.test_inference_latency,
                self.test_per_model_load_time,
                self.test_inference_stats,
            ],
            "memory": [
                self.test_memory_pressure_timeline,
                self.test_memory_eviction_triggered,
                self.test_memory_vram_accuracy,
                self.test_memory_rapid_cycling,
                self.test_memory_concurrent_pressure,
                self.test_memory_shared_memory_check,
                self.test_memory_timeline_api,
                self.test_memory_workspace_tracked,
            ],
            "profile": [
                self.test_profile_all_endpoints,
                self.test_profile_save,
            ],
        }
        if suite == "all":
            return [test for tests in suites.values() for test in tests]
        return suites.get(suite, [])

    async def run_suites(self, suite_names: list[str]) -> None:
        """Run a list of test suites with live progress feedback."""
        # Deduplicate while preserving order
        seen: set[str] = set()
        ordered: list[str] = []
        for s in suite_names:
            if s not in seen:
                seen.add(s)
                ordered.append(s)
        suite_names = ordered

        total_tests = sum(len(self._get_suite_tests(s)) for s in suite_names)

        with Progress(
            SpinnerColumn(),
            TextColumn("[bold]{task.description}"),
            BarColumn(bar_width=30),
            TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
            TimeElapsedColumn(),
            console=console,
        ) as progress:
            overall = progress.add_task("Starting...", total=total_tests)

            for suite_name in suite_names:
                tests = self._get_suite_tests(suite_name)
                if not tests:
                    console.print(f"[yellow]Unknown suite: {suite_name}[/]")
                    continue

                # Ensure clean VRAM state for state-sensitive suites
                await self._ensure_clean_vram(suite_name)

                progress.update(
                    overall,
                    description=f"[bold]{suite_name.upper()}[/]  [dim]starting...[/]",
                )
                self._suite_start = time.perf_counter()

                for test_fn in tests:
                    before_count = len(self.results)
                    try:
                        await test_fn()
                    except httpx.ConnectError:
                        self._record(TestResult(
                            name=test_fn.__doc__ or test_fn.__name__,
                            suite=suite_name,
                            passed=False,
                            message=f"Connection refused: {self.base_url}",
                        ))
                    except Exception as exc:
                        self._record(TestResult(
                            name=test_fn.__doc__ or test_fn.__name__,
                            suite=suite_name,
                            passed=False,
                            message=f"Unexpected error: {exc}",
                        ))

                    # Show latest test result in progress bar
                    new_results = self.results[before_count:]
                    if new_results:
                        last = new_results[-1]
                        tag = "[green]PASS[/]" if last.passed else "[red]FAIL[/]"
                        timing = f"  [dim]{last.elapsed_ms}ms[/]" if last.elapsed_ms else ""
                        desc = f"[bold]{suite_name.upper()}[/]  {tag} {last.name}{timing}"
                        if not last.passed and last.message:
                            # Truncate long error messages
                            msg = last.message[:80]
                            desc += f"\n         [red]{msg}[/]"
                        progress.update(overall, description=desc)

                    # Some tests record multiple results; advance by actual count
                    progress.advance(overall, advance=1)

                self._suite_times[suite_name] = time.perf_counter() - self._suite_start

    def _build_suite_table(self, suite_name: str, results: list[TestResult]) -> Table:
        """Build a Rich Table for a single suite's results."""
        s_pass = sum(1 for r in results if r.passed)
        s_total = len(results)
        status_str = f"{s_pass}/{s_total}"
        if s_pass == s_total:
            header_style = "bold green"
        else:
            header_style = "bold red"

        elapsed = self._suite_times.get(suite_name, 0)

        table = Table(
            title=f" {suite_name.upper()} [{status_str}] ({elapsed:.1f}s)",
            title_style=header_style,
            show_header=True,
            header_style="bold",
            border_style="dim",
            pad_edge=False,
            expand=True,
        )
        table.add_column("#", width=3, justify="right", style="dim")
        table.add_column("Test", min_width=30, ratio=3)
        table.add_column("Status", width=6, justify="center")
        table.add_column("Time", width=8, justify="right")
        table.add_column("Message", ratio=2, overflow="fold")

        for i, r in enumerate(results, 1):
            time_text = Text(f"{r.elapsed_ms}ms", style=_time_style(r.elapsed_ms)) if r.elapsed_ms else Text("")
            msg = Text(r.message, style="dim" if r.passed else "red")
            table.add_row(
                str(i),
                r.name,
                _status_text(r.passed),
                time_text,
                msg,
            )

        return table

    def _build_gpu_panel(self, gpu_info: dict) -> Panel:
        """Build a GPU info panel from /health data."""
        table = Table(show_header=False, border_style="dim", pad_edge=False, expand=True)
        table.add_column("Key", style="bold", min_width=20)
        table.add_column("Value")

        rows = [
            ("GPU", str(gpu_info.get("name", "unknown"))),
            ("VRAM Total", f"{gpu_info.get('vram_total_mb', 0)} MB"),
            ("VRAM Used", f"{gpu_info.get('vram_used_mb', 0)} MB"),
            ("VRAM Free", f"{gpu_info.get('vram_free_mb', 0)} MB"),
            ("GPU Utilization", f"{gpu_info.get('gpu_utilization_pct', 'N/A')}%"),
            ("Memory Utilization", f"{gpu_info.get('memory_utilization_pct', 'N/A')}%"),
            ("Temperature", f"{gpu_info.get('temperature_c', 'N/A')} C"),
            ("Power", f"{gpu_info.get('power_watts', 'N/A')} W"),
            ("Driver", str(gpu_info.get("driver_version", "N/A"))),
            ("CUDA", str(gpu_info.get("cuda_version", "N/A"))),
        ]
        for k, v in rows:
            table.add_row(k, v)
        return Panel(table, title="GPU Information", border_style="cyan")

    def _build_vram_accuracy_table(self) -> Table | None:
        """Build VRAM accuracy comparison table from memory suite results."""
        vram_results = [
            r for r in self.results
            if r.suite == "memory"
            and (r.details.get("estimated_mb") is not None
                 or r.details.get("vram_estimated_mb") is not None)
        ]
        if not vram_results:
            return None

        table = Table(
            title="VRAM Accuracy: Estimated vs Real per Model",
            title_style="bold cyan",
            show_header=True,
            header_style="bold",
            border_style="dim",
            expand=True,
        )
        table.add_column("Model", min_width=25)
        table.add_column("Estimated", justify="right", width=10)
        table.add_column("Real Delta", justify="right", width=10)
        table.add_column("Diff", justify="right", width=8)
        table.add_column("Ratio", justify="right", width=7)
        table.add_column("Load Time", justify="right", width=10)
        table.add_column("File Size", justify="right", width=10)

        for r in vram_results:
            d = r.details
            est = d.get("estimated_mb") or d.get("vram_estimated_mb") or 0
            real = d.get("real_delta_mb") or d.get("vram_delta_mb") or 0
            diff = real - est
            ratio = d.get("ratio", 0)
            file_size = d.get("file_size_mb")
            load_time = d.get("load_time_ms")

            diff_style = "red" if diff > 0 else "green" if diff < 0 else ""
            sign = "+" if diff >= 0 else ""

            table.add_row(
                d.get("model", "?"),
                f"{est} MB",
                f"{real} MB",
                Text(f"{sign}{diff} MB", style=diff_style),
                f"{ratio}x",
                f"{load_time} ms" if load_time else "-",
                f"{file_size} MB" if file_size else "-",
            )

        return table

    def _build_vram_timeline_chart(self) -> Panel | None:
        """Build an ASCII VRAM timeline chart from memory pressure test data."""
        timeline = getattr(self, "_memory_timeline", None)
        budget = getattr(self, "_memory_budget", 0)
        peak = getattr(self, "_memory_peak", 0)
        if not timeline or budget == 0:
            return None

        chart_width = 60
        chart_height = 16
        max_val = max(budget * 1.2, peak * 1.1, 1)

        # Build chart grid
        grid = [[" "] * chart_width for _ in range(chart_height)]

        # Draw budget line
        budget_row = chart_height - 1 - int((budget / max_val) * (chart_height - 1))
        budget_row = max(0, min(chart_height - 1, budget_row))
        for col in range(chart_width):
            grid[budget_row][col] = "-"

        # Plot VRAM values
        n_steps = len(timeline)
        for i, step in enumerate(timeline):
            col = int(i * (chart_width - 1) / max(n_steps - 1, 1))
            col = min(col, chart_width - 1)
            vram = step["vram_real_mb"]
            row = chart_height - 1 - int((vram / max_val) * (chart_height - 1))
            row = max(0, min(chart_height - 1, row))

            if vram > budget:
                grid[row][col] = "!"  # over budget
            else:
                grid[row][col] = "#"

            # Draw vertical bar below the point
            for r in range(row + 1, chart_height):
                if grid[r][col] == " ":
                    grid[r][col] = ":"

        # Build text lines with y-axis labels
        lines = []
        lines.append(f"  VRAM (MB)   {'VRAM Timeline During Sequential Model Loading':^{chart_width}}")
        lines.append(f"  {int(max_val):>6}  |{''.join(grid[0])}|")
        for r in range(1, chart_height - 1):
            val = int(max_val * (chart_height - 1 - r) / (chart_height - 1))
            if r == budget_row:
                lines.append(f"  {val:>6}  |{''.join(grid[r])}| <- budget ({budget} MB)")
            else:
                lines.append(f"  {val:>6}  |{''.join(grid[r])}|")
        lines.append(f"  {0:>6}  |{''.join(grid[-1])}|")

        # X-axis labels
        label_positions = []
        for i, step in enumerate(timeline):
            col = int(i * (chart_width - 1) / max(n_steps - 1, 1))
            col = min(col, chart_width - 1)
            label_positions.append((col, step["step"][:3]))

        x_line = [" "] * chart_width
        for col, label in label_positions:
            for j, ch in enumerate(label):
                if col + j < chart_width:
                    x_line[col + j] = ch

        lines.append(f"          +{''.join(['-'] * chart_width)}+")
        lines.append(f"           {''.join(x_line)}")
        lines.append("")
        lines.append("  Legend: # = VRAM   - = budget line   ! = OVER BUDGET   : = fill")
        lines.append(f"  Peak: {peak} MB   Budget: {budget} MB   "
                     f"Utilization: {peak / budget:.0%}" if budget > 0 else "")

        # Step details
        lines.append("")
        lines.append("  Step details:")
        for step in timeline:
            name = step["step"]
            vram = step["vram_real_mb"]
            loaded = step["loaded"]
            elapsed = step.get("elapsed_ms", 0)
            code = step.get("http_code", 0)
            over = " !! OVER BUDGET" if budget > 0 and vram > budget else ""
            if name == "baseline":
                lines.append(f"    {name:<20s}  VRAM={vram:>5}MB  loaded={loaded}{over}")
            else:
                lines.append(f"    {name:<20s}  VRAM={vram:>5}MB  loaded={loaded}  "
                             f"{elapsed}ms  HTTP {code}{over}")

        chart_text = "\n".join(lines)
        border = "red" if peak > budget else "green"
        return Panel(chart_text, title="VRAM Timeline", border_style=border, expand=True)

    def _build_event_table(self, events: list[dict]) -> Table | None:
        """Build event log table."""
        if not events:
            return None

        table = Table(
            title="Recent Model Events",
            title_style="bold cyan",
            show_header=True,
            header_style="bold",
            border_style="dim",
            expand=True,
        )
        table.add_column("Time", width=10)
        table.add_column("Event", width=14)
        table.add_column("Model", min_width=20)
        table.add_column("VRAM Before", justify="right", width=11)
        table.add_column("VRAM After", justify="right", width=11)
        table.add_column("Detail", ratio=1)

        event_styles = {
            "loaded": "green",
            "evicted_lru": "yellow",
            "evicted_idle": "yellow",
            "evicted_budget": "red",
            "evicted_workspace": "magenta",
            "oom_retry": "bold red",
        }

        # Show last 20 events max
        for e in events[-20:]:
            ts = datetime.fromtimestamp(e.get("timestamp", 0)).strftime("%H:%M:%S")
            event_type = e.get("event", "?")
            style = event_styles.get(event_type, "")
            table.add_row(
                ts,
                Text(event_type, style=style),
                e.get("model", "?"),
                f"{e.get('vram_before_mb', '?')} MB",
                f"{e.get('vram_after_mb', '?')} MB",
                e.get("detail", ""),
            )

        return table

    def _build_profile_table(self) -> Table | None:
        """Build VRAM profile table from profile suite results."""
        results = getattr(self, "_profile_results", [])
        if not results:
            return None

        table = Table(
            title="VRAM Profile: Isolated Per-Model Measurement",
            title_style="bold cyan",
            show_header=True,
            header_style="bold",
            border_style="dim",
            expand=True,
        )
        table.add_column("Model", min_width=20)
        table.add_column("Baseline", justify="right", width=10)
        table.add_column("Load", justify="right", width=8)
        table.add_column("Peak", justify="right", width=8)
        table.add_column("WS Peak", justify="right", width=10)
        table.add_column("WS Retained", justify="right", width=12)
        table.add_column("RAM Delta", justify="right", width=10)
        table.add_column("Shared?", justify="center", width=8)
        table.add_column("GPU%", justify="right", width=6)
        table.add_column("Temp", justify="right", width=6)
        table.add_column("Power", justify="right", width=8)
        table.add_column("Infer", justify="right", width=8)
        table.add_column("Total", justify="right", width=8)

        for r in results:
            if r.get("http_code") != 200:
                table.add_row(
                    r.get("label", "?"),
                    "-", "-", "-", "-", "-", "-",
                    Text("ERR", style="red"),
                    "-", "-", "-", "-", "-",
                )
                continue

            shared = r.get("shared_memory_detected", False)
            shared_style = "bold red" if shared else "green"

            gpu_pct = r.get("gpu_utilization_pct")
            gpu_text = f"{gpu_pct}%" if gpu_pct is not None else "-"
            temp = r.get("temperature_c")
            temp_text = f"{temp}C" if temp is not None else "-"
            power = r.get("power_watts")
            pwr_text = f"{power}W" if power is not None else "-"

            infer_ms = r.get("inference_ms", 0)
            infer_text = f"{infer_ms}ms" if infer_ms else "-"

            table.add_row(
                r.get("label", "?"),
                f"{r.get('baseline_vram_mb', 0)}MB",
                f"{r.get('load_vram_mb', 0)}MB",
                f"{r.get('peak_vram_mb', 0)}MB",
                f"{r.get('workspace_peak_mb', 0)}MB",
                f"{r.get('workspace_retained_mb', 0)}MB",
                f"{r.get('system_ram_delta_mb', 0)}MB",
                Text("YES" if shared else "NO", style=shared_style),
                gpu_text,
                temp_text,
                pwr_text,
                infer_text,
                f"{r.get('roundtrip_ms', 0)}ms",
            )

        return table

    def _build_inference_stats_table(self, stats: dict) -> Table | None:
        """Build inference statistics table from /stats data."""
        if not stats:
            return None

        table = Table(
            title="Inference Statistics",
            title_style="bold cyan",
            show_header=True,
            header_style="bold",
            border_style="dim",
            expand=True,
        )
        table.add_column("Endpoint", min_width=20)
        table.add_column("Calls", justify="right", width=7)
        table.add_column("Errors", justify="right", width=7)
        table.add_column("Avg", justify="right", width=8)
        table.add_column("Min", justify="right", width=8)
        table.add_column("Max", justify="right", width=8)

        for ep, s in sorted(stats.items()):
            err_style = "red" if s.get("errors", 0) > 0 else ""
            table.add_row(
                ep,
                str(s.get("calls", 0)),
                Text(str(s.get("errors", 0)), style=err_style),
                f"{s.get('avg_ms', 0)} ms",
                f"{s.get('min_ms', 0)} ms",
                f"{s.get('max_ms', 0)} ms",
            )

        return table

    def print_report(self) -> None:
        """Print the full test report with Rich panels and tables."""
        # -- Header --
        console.print()

        # -- GPU info panel (try to fetch) --
        gpu_info = None
        inference_stats = None
        for r in self.results:
            if r.suite == "health" and r.details.get("gpu"):
                gpu_info = r.details["gpu"]
                break

        if gpu_info:
            console.print(self._build_gpu_panel(gpu_info))
            console.print()

        # -- Per-suite result tables --
        suites: dict[str, list[TestResult]] = {}
        for r in self.results:
            suites.setdefault(r.suite, []).append(r)

        for suite_name, results in suites.items():
            console.print(self._build_suite_table(suite_name, results))
            console.print()

        # -- VRAM timeline chart (from memory pressure test) --
        timeline_chart = self._build_vram_timeline_chart()
        if timeline_chart:
            console.print(timeline_chart)
            console.print()

        # -- VRAM profile table --
        profile_table = self._build_profile_table()
        if profile_table:
            console.print(profile_table)
            console.print()

        # -- VRAM accuracy table --
        vram_table = self._build_vram_accuracy_table()
        if vram_table:
            console.print(vram_table)
            console.print()

        # -- Event log table (from memory suite or models suite) --
        all_events: list[dict] = []
        for r in self.results:
            if r.details.get("all_events"):
                all_events = r.details["all_events"]
                break
            if r.details.get("recent") and not all_events:
                all_events = r.details["recent"]
        if all_events:
            event_table = self._build_event_table(all_events)
            if event_table:
                console.print(event_table)
                console.print()

        # -- Inference stats table --
        inference_stats = None
        for r in self.results:
            if r.suite == "benchmark" and r.details.get("stats"):
                inference_stats = r.details["stats"]
        if inference_stats:
            stats_table = self._build_inference_stats_table(inference_stats)
            if stats_table:
                console.print(stats_table)
                console.print()

        # -- Summary table --
        total = len(self.results)
        passed = sum(1 for r in self.results if r.passed)
        failed = total - passed

        summary = Table(
            title="FINAL SUMMARY",
            title_style="bold",
            show_header=True,
            header_style="bold",
            border_style="green" if failed == 0 else "red",
            expand=True,
        )
        summary.add_column("Suite", min_width=15)
        summary.add_column("Pass", justify="right", width=6, style="green")
        summary.add_column("Fail", justify="right", width=6, style="red")
        summary.add_column("Total", justify="right", width=6)
        summary.add_column("Time", justify="right", width=10)

        total_time = 0.0
        for suite_name, results in suites.items():
            s_pass = sum(1 for r in results if r.passed)
            s_fail = len(results) - s_pass
            s_time = self._suite_times.get(suite_name, 0)
            total_time += s_time
            row_style = "" if s_fail == 0 else "bold"
            summary.add_row(
                suite_name,
                str(s_pass),
                str(s_fail) if s_fail > 0 else "-",
                str(len(results)),
                f"{s_time:.1f}s",
                style=row_style,
            )

        summary.add_section()
        summary.add_row(
            Text("TOTAL", style="bold"),
            Text(str(passed), style="bold green"),
            Text(str(failed), style="bold red") if failed > 0 else Text("-"),
            Text(str(total), style="bold"),
            Text(f"{total_time:.1f}s", style="bold"),
        )

        console.print(Panel(summary, border_style="green" if failed == 0 else "red"))

        # -- Failed tests detail --
        if failed > 0:
            fail_table = Table(
                title="FAILED TESTS",
                title_style="bold red",
                show_header=True,
                header_style="bold",
                border_style="red",
                expand=True,
            )
            fail_table.add_column("#", width=3, justify="right")
            fail_table.add_column("Suite", width=12)
            fail_table.add_column("Test", ratio=2)
            fail_table.add_column("Error", ratio=3, overflow="fold")

            for i, r in enumerate(
                (r for r in self.results if not r.passed), 1
            ):
                fail_table.add_row(
                    str(i),
                    Text(r.suite, style="yellow"),
                    r.name,
                    Text(r.message, style="red"),
                )

            console.print()
            console.print(fail_table)

        console.print()

        # -- Verbose: detailed output for all tests --
        if self.verbose:
            for r in self.results:
                if r.details and (not r.passed or self.verbose):
                    console.print(
                        Panel(
                            str(r.details),
                            title=f"[dim]{r.suite}[/] / {r.name}",
                            border_style="dim" if r.passed else "red",
                        )
                    )


# ── CLI ────────────────────────────────────────────────────────────────


def _resolve_suites(modes: list[str]) -> list[str]:
    """Resolve positional arguments into an ordered suite list."""
    if not modes:
        return []

    # Single preset name
    if len(modes) == 1 and modes[0] in PRESETS:
        return list(PRESETS[modes[0]][1])

    # Explicit suite names
    suites: list[str] = []
    for m in modes:
        if m in SUITE_NAMES:
            if m not in suites:
                suites.append(m)
        else:
            console.print(f"[red]Unknown suite or preset: '{m}'[/]")
            console.print(f"[dim]Presets: {', '.join(PRESETS)}[/]")
            console.print(f"[dim]Suites:  {', '.join(sorted(SUITE_NAMES))}[/]")
            sys.exit(1)
    return suites


def main() -> None:
    preset_list = "  ".join(f"[bold]{k}[/]" for k in PRESETS)
    parser = argparse.ArgumentParser(
        description="Cortex service test suite",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"""presets: {', '.join(PRESETS)}
suites:  {', '.join(sorted(SUITE_NAMES))}

examples:
  %(prog)s                     interactive TUI menu
  %(prog)s quick               health + models + inference
  %(prog)s standard            all core suites
  %(prog)s benchmark           standard + performance
  %(prog)s stress              standard + memory pressure
  %(prog)s profile             isolated VRAM profiling
  %(prog)s full                everything
  %(prog)s health inference    specific suites
""",
    )
    parser.add_argument(
        "mode", nargs="*", default=[],
        help="preset name or suite name(s) (omit for TUI menu)",
    )
    parser.add_argument(
        "--url", default=DEFAULT_URL,
        help=f"Cortex base URL (default: {DEFAULT_URL})",
    )
    parser.add_argument(
        "-v", "--verbose", action="store_true",
        help="show detailed output for each test",
    )
    args = parser.parse_args()

    # Determine suite list: TUI menu if no args, otherwise resolve
    if not args.mode:
        suites = _show_tui_menu(args.url)
    else:
        suites = _resolve_suites(args.mode)

    if not suites:
        console.print("[red]No suites selected[/]")
        sys.exit(1)

    # Header panel
    header = Table(show_header=False, border_style="dim", pad_edge=False, expand=True)
    header.add_column("Key", style="bold", width=10)
    header.add_column("Value")
    header.add_row("Target", args.url)
    header.add_row("Suites", ", ".join(suites))
    header.add_row("Time", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    console.print(Panel(header, title="Cortex Test Suite", border_style="bold cyan"))

    async def _run() -> None:
        runner_ref[0] = TestRunner(base_url=args.url, verbose=args.verbose)
        try:
            await runner_ref[0].run_suites(suites)
        finally:
            await runner_ref[0].close()

    runner_ref: list[TestRunner | None] = [None]
    try:
        asyncio.run(_run())
    except KeyboardInterrupt:
        console.print("\n[yellow]Interrupted[/]")

    runner = runner_ref[0]
    if runner is None:
        sys.exit(1)

    runner.print_report()

    # Save report to file (overwrite each time)
    try:
        report_text = console.export_text()
        REPORT_PATH.write_text(report_text, encoding="utf-8")
        console.print(f"[dim]Report saved to {REPORT_PATH}[/]")
    except Exception as exc:
        console.print(f"[yellow]Failed to save report: {exc}[/]")

    failed = sum(1 for r in runner.results if not r.passed)
    sys.exit(1 if failed > 0 else 0)


if __name__ == "__main__":
    main()
