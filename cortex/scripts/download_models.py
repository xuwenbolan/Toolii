#!/usr/bin/env python3
"""Download ONNX models from HuggingFace for Cortex GPU inference."""
from __future__ import annotations

import argparse
import sys
import urllib.request
from pathlib import Path

# Required models (~1.6GB) — always downloaded
REQUIRED_MODELS: dict[str, str] = {
    "birefnet/birefnet-general.onnx": "https://huggingface.co/onnx-community/BiRefNet/resolve/main/onnx/model.onnx",
    "realesrgan/realesrgan-x4plus.onnx": "https://huggingface.co/ai-forever/Real-ESRGAN/resolve/main/RealESRGAN_x4.onnx",
    "realesrgan/realesrgan-x4v3.onnx": "https://huggingface.co/ai-forever/Real-ESRGAN/resolve/main/RealESRGAN_x4v3.onnx",
    "gfpgan/gfpgan-v1.4.onnx": "https://huggingface.co/public-data/GFPGAN/resolve/main/GFPGANv1.4.onnx",
    "gfpgan/retinaface-resnet50.onnx": "https://huggingface.co/public-data/insightface/resolve/main/models/retinaface_resnet50/det_10g.onnx",
    "nafnet/nafnet-sidd-w64.onnx": "https://huggingface.co/public-data/NAFNet/resolve/main/NAFNet-SIDD-width64.onnx",
    "ddcolor/ddcolor-artistic.onnx": "https://huggingface.co/piddnad/DDColor-models/resolve/main/ddcolor_artistic.onnx",
    "inpaint/lama.onnx": "https://huggingface.co/smartywu/big-lama-onnx/resolve/main/big-lama.onnx",
    "inpaint/migan.onnx": "https://huggingface.co/smartywu/MI-GAN-onnx/resolve/main/migan_pipeline_v2.onnx",
    "rapidocr/rapidocr-det.onnx": "https://huggingface.co/SWHL/RapidOCR/resolve/main/PP-OCRv4/ch_PP-OCRv4_det_infer.onnx",
    "rapidocr/rapidocr-cls.onnx": "https://huggingface.co/SWHL/RapidOCR/resolve/main/PP-OCRv4/ch_ppocr_mobile_v2.0_cls_infer.onnx",
    "rapidocr/rapidocr-rec.onnx": "https://huggingface.co/SWHL/RapidOCR/resolve/main/PP-OCRv4/ch_PP-OCRv4_rec_infer.onnx",
    "mobilesam/mobilesam-encoder.onnx": "https://huggingface.co/vietanhdev/segment-anything-onnx/resolve/main/mobile_sam_encoder.onnx",
    "mobilesam/mobilesam-decoder.onnx": "https://huggingface.co/vietanhdev/segment-anything-onnx/resolve/main/mobile_sam_decoder.onnx",
}

# Optional models (~2.5GB additional) — downloaded with --all
OPTIONAL_MODELS: dict[str, str] = {
    "birefnet/birefnet-portrait.onnx": "",
    "birefnet/birefnet-lite.onnx": "",
    "birefnet/birefnet-matting.onnx": "",
    "realesrgan/realesrgan-anime.onnx": "",
    "nafnet/nafnet-sidd-w32.onnx": "",
    "nafnet/nafnet-gopro-w64.onnx": "",
    "nafnet/nafnet-gopro-w32.onnx": "",
    "ddcolor/ddcolor-modelscope.onnx": "",
    "ddcolor/ddcolor-tiny.onnx": "",
}


def download_file(url: str, dest: Path) -> None:
    """Download a file with progress reporting."""
    if not url:
        print(f"  SKIP {dest.name} (URL not configured yet)")
        return

    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        print(f"  EXISTS {dest}")
        return

    print(f"  Downloading {dest.name} ...", end="", flush=True)
    try:
        urllib.request.urlretrieve(url, dest)
        size_mb = dest.stat().st_size / 1024 / 1024
        print(f" OK ({size_mb:.1f}MB)")
    except Exception as e:
        print(f" FAILED: {e}")
        if dest.exists():
            dest.unlink()


def main() -> None:
    parser = argparse.ArgumentParser(description="Download ONNX models for Cortex")
    parser.add_argument(
        "--model-dir", type=Path, default=Path("models"),
        help="Target directory for models (default: models/)",
    )
    parser.add_argument(
        "--all", action="store_true",
        help="Download optional models in addition to required ones",
    )
    args = parser.parse_args()

    model_dir: Path = args.model_dir
    model_dir.mkdir(parents=True, exist_ok=True)

    print(f"Model directory: {model_dir.resolve()}")

    print("\n=== Required Models ===")
    for rel_path, url in REQUIRED_MODELS.items():
        download_file(url, model_dir / rel_path)

    if args.all:
        print("\n=== Optional Models ===")
        for rel_path, url in OPTIONAL_MODELS.items():
            download_file(url, model_dir / rel_path)

    print("\nDone.")


if __name__ == "__main__":
    main()
