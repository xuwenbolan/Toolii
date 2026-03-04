#!/usr/bin/env python3
"""Download ONNX models from HuggingFace for Cortex GPU inference."""
from __future__ import annotations

import argparse
import hashlib
import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from threading import Lock

from rich.console import Console
from rich.progress import (
    BarColumn,
    DownloadColumn,
    Progress,
    SpinnerColumn,
    TaskID,
    TextColumn,
    TimeRemainingColumn,
    TransferSpeedColumn,
)

_console = Console()
_checksums_lock = Lock()
_MB = 1 << 20

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
_DEFAULT_MODEL_DIR = _PROJECT_ROOT / "data" / "cortex" / "models"
CHECKSUMS_FILE = Path(__file__).parent / "model_checksums.json"


# ── Model registry ────────────────────────────────────────────────────


@dataclass(frozen=True)
class Model:
    url: str


REQUIRED: dict[str, Model] = {
    "birefnet/birefnet-general.onnx": Model(
        "https://huggingface.co/onnx-community/BiRefNet-ONNX/resolve/main/onnx/model.onnx",
    ),
    "realesrgan/realesrgan-x4plus.onnx": Model(
        "https://huggingface.co/facefusion/models-3.0.0/resolve/main/real_esrgan_x4.onnx",
    ),
    "realesrgan/realesrgan-x4v3.onnx": Model(
        "https://huggingface.co/OwlMaster/AllFilesRope/resolve/main/realesr-general-x4v3.onnx",
    ),
    "gfpgan/gfpgan-v1.4.onnx": Model(
        "https://huggingface.co/facefusion/models-3.0.0/resolve/main/gfpgan_1.4.onnx",
    ),
    "gfpgan/retinaface-resnet50.onnx": Model(
        "https://huggingface.co/DIAMONIK7777/antelopev2/resolve/main/scrfd_10g_bnkps.onnx",
    ),
    "nafnet/nafnet-sidd-w64.onnx": Model(
        "https://huggingface.co/deepghs/image_restoration/resolve/main/NAFNet-SIDD-width64.onnx",
    ),
    "ddcolor/ddcolor-artistic.onnx": Model(
        "https://huggingface.co/facefusion/models-3.0.0/resolve/main/ddcolor_artistic.onnx",
    ),
    "inpaint/lama.onnx": Model(
        "https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama.onnx",
    ),
    "inpaint/migan.onnx": Model(
        "https://huggingface.co/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx",
    ),
    "rapidocr/rapidocr-det.onnx": Model(
        "https://huggingface.co/SWHL/RapidOCR/resolve/main/PP-OCRv4/ch_PP-OCRv4_det_infer.onnx",
    ),
    "rapidocr/rapidocr-cls.onnx": Model(
        "https://huggingface.co/SWHL/RapidOCR/resolve/main/PP-OCRv3/ch_ppocr_mobile_v2.0_cls_train.onnx",
    ),
    "rapidocr/rapidocr-rec.onnx": Model(
        "https://huggingface.co/SWHL/RapidOCR/resolve/main/PP-OCRv4/ch_PP-OCRv4_rec_infer.onnx",
    ),
    "mobilesam/mobilesam-encoder.onnx": Model(
        "https://huggingface.co/Acly/MobileSAM/resolve/main/mobile_sam_image_encoder.onnx",
    ),
    "mobilesam/mobilesam-decoder.onnx": Model(
        "https://huggingface.co/Acly/MobileSAM/resolve/main/sam_mask_decoder_single.onnx",
    ),
}

# Optional models — downloaded with --all
OPTIONAL: dict[str, Model] = {
    "birefnet/birefnet-portrait.onnx": Model(
        "https://huggingface.co/onnx-community/BiRefNet-portrait-ONNX/resolve/main/onnx/model.onnx",
    ),
    "birefnet/birefnet-lite.onnx": Model(
        "https://huggingface.co/onnx-community/BiRefNet_lite-ONNX/resolve/main/onnx/model.onnx",
    ),
    "birefnet/birefnet-matting.onnx": Model(
        "https://github.com/ZhengPeng7/BiRefNet/releases/download/v1/BiRefNet-matting-epoch_100.onnx",
    ),
    "realesrgan/realesrgan-anime.onnx": Model(
        "https://huggingface.co/T8RIN/ddcolor-onnx/resolve/main/upscalers/RealESR-AnimeVideo-x4v3.onnx",
    ),
    "nafnet/nafnet-sidd-w32.onnx": Model(
        "https://storage.googleapis.com/ailia-models/nafnet/NAFNet-SIDD-width32.onnx",
    ),
    "nafnet/nafnet-gopro-w64.onnx": Model(
        "https://huggingface.co/deepghs/image_restoration/resolve/main/NAFNet-GoPro-width64.onnx",
    ),
    "nafnet/nafnet-gopro-w32.onnx": Model(
        "https://storage.googleapis.com/ailia-models/nafnet/NAFNet-GoPro-width32.onnx",
    ),
    "ddcolor/ddcolor-modelscope.onnx": Model(
        "https://huggingface.co/facefusion/models-3.0.0/resolve/main/ddcolor.onnx",
    ),
    # ddcolor-tiny: no ONNX available, needs PyTorch conversion
}


# ── Checksums ─────────────────────────────────────────────────────────


def _load_checksums() -> dict[str, str]:
    if CHECKSUMS_FILE.exists():
        data = CHECKSUMS_FILE.read_text().strip()
        return json.loads(data) if data else {}
    return {}


def _save_checksums(checksums: dict[str, str]) -> None:
    CHECKSUMS_FILE.write_text(json.dumps(checksums, indent=2, sort_keys=True) + "\n")


# ── Helpers ───────────────────────────────────────────────────────────


def _sha256(path: Path, progress: Progress, task: TaskID) -> str:
    """Compute SHA256 while advancing a progress bar."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(_MB):
            h.update(chunk)
            progress.advance(task, len(chunk))
    return h.hexdigest()


def _fmt_mb(n: int) -> str:
    return f"{n / _MB:.1f}MB"


def _make_progress() -> Progress:
    return Progress(
        SpinnerColumn(),
        TextColumn("{task.description}", style="bold"),
        BarColumn(bar_width=30),
        DownloadColumn(),
        TransferSpeedColumn(),
        TimeRemainingColumn(compact=True),
        console=_console,
    )


# ── Core ──────────────────────────────────────────────────────────────


def download_one(
    rel: str,
    dest: Path,
    model: Model,
    checksums: dict[str, str],
    progress: Progress,
) -> bool:
    """Download a single model. Returns True on success."""
    if not model.url:
        return False

    dest.parent.mkdir(parents=True, exist_ok=True)
    expected = checksums.get(rel, "")

    # Verify existing file
    if dest.exists():
        size = dest.stat().st_size
        task = progress.add_task(f"CHECK {dest.name}", total=size)
        actual = _sha256(dest, progress, task)

        if not expected:
            # No known hash — record it
            with _checksums_lock:
                checksums[rel] = actual
            progress.update(task, description=f"[green]OK    {dest.name}[/] [dim](hash recorded)[/]")
            return True

        if actual == expected:
            progress.update(task, description=f"[green]OK    {dest.name}[/]")
            return True

        progress.remove_task(task)
        _console.print(f"  [yellow]HASH  {dest.name}: mismatch, re-downloading[/]")
        dest.unlink()

    # Atomic download: .tmp -> stream + hash -> rename
    tmp = dest.with_suffix(dest.suffix + ".tmp")
    tmp.unlink(missing_ok=True)

    try:
        resp = urllib.request.urlopen(model.url)  # noqa: S310
        total = int(resp.headers.get("Content-Length", 0))
        task = progress.add_task(f"[cyan]GET   {dest.name}[/]", total=total or None)

        h = hashlib.sha256()
        received = 0
        with open(tmp, "wb") as f:
            while chunk := resp.read(_MB):
                f.write(chunk)
                h.update(chunk)
                received += len(chunk)
                progress.advance(task, len(chunk))

        if total and received != total:
            progress.update(
                task,
                description=f"[red]TRUNC {dest.name}[/] [dim]({_fmt_mb(received)}/{_fmt_mb(total)})[/]",
            )
            tmp.unlink()
            return False

        sha = h.hexdigest()
    except Exception as e:
        _console.print(f"  [red]FAIL  {dest.name}: {e}[/]")
        tmp.unlink(missing_ok=True)
        return False

    # Verify against known hash (if any)
    if expected and sha != expected:
        progress.update(task, description=f"[red]FAIL  {dest.name}[/] [dim](hash mismatch)[/]")
        tmp.unlink()
        return False

    tmp.rename(dest)
    with _checksums_lock:
        checksums[rel] = sha
    progress.update(task, description=f"[green]OK    {dest.name}[/]")
    return True


def verify_one(
    rel: str,
    dest: Path,
    checksums: dict[str, str],
    progress: Progress,
) -> bool:
    """Verify a single model against its known hash."""
    if not dest.exists():
        _console.print(f"  [red]MISS  {rel}[/]")
        return False

    expected = checksums.get(rel, "")
    size = dest.stat().st_size
    task = progress.add_task(f"CHECK {dest.name}", total=size)
    actual = _sha256(dest, progress, task)

    if not expected:
        progress.update(task, description=f"[yellow]WARN  {dest.name}[/] [dim](no hash on record)[/]")
        return False

    if actual != expected:
        progress.update(task, description=f"[red]FAIL  {dest.name}[/]")
        return False

    progress.update(task, description=f"[green]OK    {dest.name}[/]")
    return True


# ── CLI ───────────────────────────────────────────────────────────────


def main() -> None:
    parser = argparse.ArgumentParser(description="Download ONNX models for Cortex")
    parser.add_argument(
        "--model-dir", type=Path, default=_DEFAULT_MODEL_DIR,
        help=f"Target directory (default: {_DEFAULT_MODEL_DIR})",
    )
    parser.add_argument("--all", action="store_true", help="Include optional models")
    parser.add_argument("--verify", action="store_true", help="Verify only, no download")
    parser.add_argument(
        "-j", "--jobs", type=int, default=4,
        help="Concurrent downloads (default: 4)",
    )
    args = parser.parse_args()

    model_dir: Path = args.model_dir
    model_dir.mkdir(parents=True, exist_ok=True)

    models = dict(REQUIRED)
    if args.all:
        models.update(OPTIONAL)
    active = {r: m for r, m in models.items() if m.url}

    checksums = _load_checksums()

    _console.print(f"Model directory: [bold]{model_dir.resolve()}[/]")
    _console.print(f"Checksums:       [bold]{CHECKSUMS_FILE}[/]")
    _console.print(f"Models:          {len(active)} active, {len(models) - len(active)} skipped\n")

    if args.verify:
        _console.rule("Verify")
        ok = fail = 0
        with _make_progress() as progress:
            for rel in active:
                if verify_one(rel, model_dir / rel, checksums, progress):
                    ok += 1
                else:
                    fail += 1
        _console.print(f"\n[green]{ok} OK[/], [red]{fail} failed[/]")
        raise SystemExit(1 if fail else 0)

    _console.rule(f"Download (jobs={args.jobs})")
    ok = fail = 0
    with _make_progress() as progress:
        with ThreadPoolExecutor(max_workers=args.jobs) as pool:
            futures = {
                pool.submit(download_one, rel, model_dir / rel, m, checksums, progress): rel
                for rel, m in active.items()
            }
            for future in as_completed(futures):
                try:
                    if future.result():
                        ok += 1
                    else:
                        fail += 1
                except Exception as e:
                    _console.print(f"  [red]ERR   {futures[future]}: {e}[/]")
                    fail += 1

    _save_checksums(checksums)
    _console.print(f"\n[green]{ok} OK[/], [red]{fail} failed[/]")
    if checksums:
        _console.print(f"[dim]Checksums saved to {CHECKSUMS_FILE}[/]")
    raise SystemExit(1 if fail else 0)


if __name__ == "__main__":
    main()
