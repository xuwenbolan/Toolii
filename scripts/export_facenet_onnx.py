#!/usr/bin/env python3
"""One-time script to export Facenet512 (InceptionResnetV1) to ONNX format.

Usage:
    uv run --with facenet-pytorch --with torch --with onnx --with onnxruntime --with onnxscript \
        python scripts/export_facenet_onnx.py

Output:
    data/models/facenet512.onnx (~90 MB, single file with embedded weights)
"""

from pathlib import Path

import numpy as np
import onnx
import torch

INPUT_SHAPE = (1, 3, 160, 160)
OUTPUT_DIR = Path(__file__).resolve().parents[1] / "data" / "models"
OUTPUT_PATH = OUTPUT_DIR / "facenet512.onnx"


def main() -> None:
    from facenet_pytorch import InceptionResnetV1

    print("Loading InceptionResnetV1 pretrained on VGGFace2 ...")
    model = InceptionResnetV1(pretrained="vggface2", classify=False)
    model.eval()

    dummy = torch.randn(*INPUT_SHAPE)
    with torch.no_grad():
        out = model(dummy)
    print(f"PyTorch output shape: {out.shape}")  # (1, 512)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    tmp_path = OUTPUT_PATH.with_suffix(".tmp.onnx")
    print(f"Exporting to {OUTPUT_PATH} ...")
    torch.onnx.export(
        model,
        dummy,
        str(tmp_path),
        input_names=["input"],
        output_names=["embedding"],
        dynamic_axes={"input": {0: "batch"}, "embedding": {0: "batch"}},
        opset_version=14,
    )

    # Merge external data into a single ONNX file
    onnx_model = onnx.load(str(tmp_path), load_external_data=True)
    onnx.save_model(
        onnx_model,
        str(OUTPUT_PATH),
        save_as_external_data=False,
    )

    # Clean up temporary files
    tmp_path.unlink(missing_ok=True)
    tmp_data = tmp_path.with_suffix(".tmp.onnx.data")
    tmp_data.unlink(missing_ok=True)
    # Also clean any .data file from previous runs
    for f in OUTPUT_DIR.glob("facenet512.onnx*"):
        if f != OUTPUT_PATH:
            f.unlink(missing_ok=True)

    size_mb = OUTPUT_PATH.stat().st_size / 1024 / 1024
    print(f"Exported: {OUTPUT_PATH} ({size_mb:.1f} MB)")

    # Verify with ONNX Runtime
    import onnxruntime as ort

    sess = ort.InferenceSession(str(OUTPUT_PATH), providers=["CPUExecutionProvider"])
    ort_out = sess.run(None, {"input": dummy.numpy()})[0]
    diff = np.abs(out.numpy() - ort_out).max()
    print(f"Max abs diff (PyTorch vs ONNX Runtime): {diff:.6e}")
    assert diff < 1e-5, f"Verification failed: diff={diff}"
    print("Verification passed!")


if __name__ == "__main__":
    main()
