# Toolii Cortex: ONNX Runtime Unified Inference Migration Plan

## Architecture Decision

- **Inference engine**: ONNX Runtime + CUDA EP (no TensorRT)
- **Target GPU**: NVIDIA RTX 4070 Ti (12GB VRAM, Ada Lovelace SM89)
- **Model scheduling**: LRU ModelManager with VRAM budget
- **FP16**: Pre-convert ONNX models offline using onnxconverter-common

## Model Selection

| Function | Model | ONNX Size | License | Notes |
|----------|-------|-----------|---------|-------|
| Background Removal | BiRefNet (via rembg `birefnet-general`) | ~800MB | MIT | SOTA quality, rembg built-in |
| Super Resolution | Real-ESRGAN (x4plus + general-x4v3 compact) | 64MB / 6MB | BSD-3 | Dual mode: quality / speed |
| Face Restoration | GFPGAN v1.4 | ~330MB | Apache-2.0 | Replaces CodeFormer (NTU S-Lab license risk) |
| Image Denoising | NAFNet width64 | ~105MB | MIT | SIDD 40.30dB SOTA, pure CNN |
| Colorization | DDColor-T (tiny) | ~100MB | Apache-2.0 | Official ONNX export script |
| Inpainting | LaMa + MI-GAN | 102MB / 11MB | Apache-2.0 / MIT | Route by mask area |
| OCR | RapidOCR (PP-OCRv4 ONNX) | ~16MB | Apache-2.0 | Drop PaddlePaddle dependency |
| Segmentation | MobileSAM | ~10MB | Apache-2.0 | 9.66M params, 12ms latency |

Total ONNX model size: ~1.5GB
Total VRAM (FP16, all loaded): ~2.5GB

## VRAM Budget (RTX 4070 Ti 12GB)

```
Total VRAM:                12,288 MB
System/CUDA context:        -500 MB
Available:                  ~11,788 MB
All models FP16:            ~2,550 MB
Headroom for activations:   ~9,238 MB  (plenty)
```

All 8 models can stay resident simultaneously. LRU eviction as safety net only.

## Docker Optimization

### Key changes:
1. Remove PyTorch (~2GB) and PaddlePaddle (~700MB) dependencies
2. Single dependency: `onnxruntime-gpu` (~200MB)
3. Multi-stage Dockerfile with layer caching
4. Models via volume mount (not baked into image)
5. BuildKit cache mounts for uv/pip

### Expected build times:
- Code change only: <1 min
- Dependency change: 2-3 min
- Full cold build: 5-7 min

## Key Components to Build

### 1. OnnxModelManager
- Model registry (name, path, estimated_vram, priority)
- Lazy loading on first request
- LRU eviction (weighted: recency + frequency + priority)
- VRAM budget enforcement
- OOM catch -> evict -> retry
- /health endpoint with stats

### 2. ONNX Session Configuration
```python
sess_opts = ort.SessionOptions()
sess_opts.enable_mem_pattern = True
sess_opts.enable_mem_reuse = True
sess_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

cuda_options = {
    "device_id": 0,
    "arena_extend_strategy": "kSameAsRequested",
    "cudnn_conv_algo_search": "HEURISTIC",
}

providers = [("CUDAExecutionProvider", cuda_options), "CPUExecutionProvider"]
```

### 3. FP16 Model Conversion (offline, one-time)
```python
from onnxconverter_common import float16
import onnx

model = onnx.load("model_fp32.onnx")
model_fp16 = float16.convert_float_to_float16(model)
onnx.save(model_fp16, "model_fp16.onnx")
```

### 4. Inpainting Router
- mask area < 10%: MI-GAN (fast, 11MB)
- mask area >= 10%: LaMa (quality, 102MB)

### 5. Cortex FastAPI Endpoints (same API contract)
- POST /v1/remove-background -> BiRefNet
- POST /v1/upscale -> Real-ESRGAN
- POST /v1/restore-face -> GFPGAN
- POST /v1/denoise -> NAFNet
- POST /v1/colorize -> DDColor-T
- POST /v1/inpaint -> LaMa / MI-GAN
- POST /v1/ocr -> RapidOCR
- POST /v1/segment -> MobileSAM
- GET /health -> ModelManager stats

## Migration Notes

- Keep same HTTP API contract so backend cortex_client.py needs no changes
- CodeFormer -> GFPGAN: fidelity weight `w` parameter no longer applicable
  (GFPGAN has no equivalent, always produces natural results)
- PaddleOCR -> RapidOCR: same PP-OCRv4 weights, API nearly compatible
- SAM2 -> MobileSAM: same point/box prompt interface, decoder compatible
- BiRefNet via rembg: just change model_name parameter
