# Model Storage Spec

Status: draft | Updated: 2026-03-04

## Directory Layout

```
data/
├── models/
│   └── facenet512.onnx              # Backend owns (face similarity, CPU)
└── cortex/
    └── models/                      # Cortex owns (GPU models)
        ├── birefnet/
        │   ├── birefnet-general.onnx        # ~800MB  (required)
        │   ├── birefnet-portrait.onnx       # ~800MB  (optional)
        │   ├── birefnet-lite.onnx           # ~400MB  (optional)
        │   └── birefnet-matting.onnx        # ~800MB  (optional)
        ├── realesrgan/
        │   ├── realesrgan-x4plus.onnx       # ~64MB   (required)
        │   ├── realesrgan-x4v3.onnx         # ~6MB    (required)
        │   └── realesrgan-anime.onnx        # ~64MB   (optional)
        ├── gfpgan/
        │   ├── gfpgan-v1.4.onnx             # ~330MB  (required)
        │   └── retinaface-resnet50.onnx     # ~100MB  (required, face detect for GFPGAN)
        ├── nafnet/
        │   ├── nafnet-sidd-w64.onnx         # ~105MB  (required)
        │   ├── nafnet-sidd-w32.onnx         # ~30MB   (optional)
        │   ├── nafnet-gopro-w64.onnx        # ~105MB  (optional, deblur)
        │   └── nafnet-gopro-w32.onnx        # ~30MB   (optional)
        ├── ddcolor/
        │   ├── ddcolor-artistic.onnx        # ~100MB  (required)
        │   └── ddcolor-modelscope.onnx      # ~200MB  (optional)
        ├── inpaint/
        │   ├── lama.onnx                    # ~102MB  (required)
        │   └── migan.onnx                   # ~11MB   (required)
        ├── rapidocr/
        │   ├── rapidocr-det.onnx            # ~3MB    (required)
        │   ├── rapidocr-cls.onnx            # ~2MB    (required)
        │   └── rapidocr-rec.onnx            # ~11MB   (required)
        └── mobilesam/
            ├── mobilesam-encoder.onnx       # ~5MB    (required)
            └── mobilesam-decoder.onnx       # ~5MB    (required)
```

## Size Summary

| Category | Required | Optional |
|----------|----------|----------|
| BiRefNet | 800MB | 2,000MB |
| Real-ESRGAN | 70MB | 64MB |
| GFPGAN + RetinaFace | 430MB | - |
| NAFNet | 105MB | 165MB |
| DDColor | 100MB | 200MB |
| Inpaint (LaMa + MI-GAN) | 113MB | - |
| RapidOCR | 16MB | - |
| MobileSAM | 10MB | - |
| **Total** | **~1,644MB** | **~2,429MB** |

## Required vs Optional

**Required models** (~1.6GB): Downloaded by `cortex/scripts/download_models.py`.
Must exist for Cortex to serve all endpoints with default parameters.

**Optional models** (~2.5GB additional): Downloaded with `--all` flag.
When a request specifies an optional variant that isn't downloaded,
Cortex returns 400 `MODEL_NOT_FOUND`.

## FP16 Conversion

All models should be pre-converted to FP16 offline for VRAM savings:

```python
from onnxconverter_common import float16
import onnx

model = onnx.load("model_fp32.onnx")
model_fp16 = float16.convert_float_to_float16(model)
onnx.save(model_fp16, "model_fp16.onnx")
```

After FP16 conversion, total VRAM for all required models drops to ~2.5GB.

## Git and Docker

- `data/` is git-ignored
- Backend mounts `data/` volume — FaceNet512 at `data/models/facenet512.onnx`
- Cortex mounts `data/cortex/` volume — GPU models at `data/cortex/models/`
- `cortex/scripts/download_models.py` handles downloading from HuggingFace

## Execution Providers

Most models run on CUDA EP (GPU). Exceptions:

| Model | Provider | Reason |
|-------|----------|--------|
| LaMa | CPU only | 144 DFT (FFT) ops lack CUDA kernels; GPU causes 120s+ timeout from repeated GPU↔CPU copies. CPU runs ~5s for 512x512. |

The `ModelInfo.cpu_only` flag controls this — cpu_only models skip VRAM budgeting and workspace headroom checks.

## Disabled Models

| Model | Reason |
|-------|--------|
| ddcolor-tiny | No ONNX model available; needs PyTorch-to-ONNX conversion |

## Model Sources

See [/docs/references/](../references/) for detailed per-model research data
including architecture, parameters, ONNX export procedures, and source repos.
