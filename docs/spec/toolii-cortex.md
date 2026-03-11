# toolii-cortex Module Spec

Status: draft | Updated: 2026-03-10

## Role

Stateless GPU inference service. Pure function: image in -> image out.
No auth, no storage, no business logic.

## Tech Stack

| Item | Value |
|------|-------|
| Runtime | Python 3.13 |
| Framework | FastAPI |
| Inference | ONNX Runtime + CUDA ExecutionProvider |
| Package manager | uv |
| Docker image | nvidia/cuda base + onnxruntime-gpu |
| Port | 9100 |
| GPU | NVIDIA RTX 4070 Ti (12GB VRAM) |

## Ownership

### Cortex OWNS

- ONNX model loading and lifecycle (`model_loader.py` with LRU eviction, `model_registry.py` for discovery)
- VRAM budget management and OOM recovery
- Model health monitoring and circuit breaking (`model_health.py`)
- Request concurrency control and dedup (`concurrency.py`)
- Request statistics and throughput tracking (`request_stats.py`)
- Per-model pre/post processing (resize, normalize, tile, decode)
- Model download script

### Cortex does NOT own

- User auth or rate limiting (Backend handles before calling)
- File storage or signed URLs
- Business logic or credit deduction
- Background removal fallback (Backend's responsibility)

## Project Structure

```
cortex/
├── pyproject.toml
├── app/
│   ├── main.py                 # FastAPI app factory
│   ├── config.py               # Settings: model_dir, vram_budget, port
│   ├── gpu.py                  # GPU/CUDA utilities
│   ├── utils.py                # Shared helpers
│   │
│   │   # Model management (split from former monolithic model_manager.py)
│   ├── model_manager.py        # OnnxModelManager facade
│   ├── model_registry.py       # Model registration and discovery
│   ├── model_loader.py         # ONNX session loading, VRAM management, eviction
│   ├── model_health.py         # Circuit breaker, health checks
│   │
│   │   # Request handling (split from former monolithic router.py)
│   ├── router.py               # /v1/* endpoints with unified _run_inference/_attach_meta helpers
│   ├── concurrency.py          # Semaphore, dedup, queue management
│   ├── request_stats.py        # Request counting, timing, throughput
│   │
│   └── engines/                # Per-model pre/post processing
│       ├── base.py             # BaseEngine ABC
│       ├── birefnet.py         # Background removal (4 variants)
│       ├── realesrgan.py       # Super resolution (3 variants)
│       ├── gfpgan.py           # Face restoration (+ RetinaFace detection)
│       ├── nafnet.py           # Denoise / deblur (4 variants)
│       ├── ddcolor.py          # Colorization (3 variants)
│       ├── lama.py             # Inpainting (large masks)
│       ├── migan.py            # Inpainting (small masks)
│       ├── rapidocr.py         # OCR (det + cls + rec)
│       └── mobilesam.py        # Segmentation (encoder + decoder)
└── scripts/
    └── download_models.py      # Download ONNX models from HuggingFace
```

## OnnxModelManager

```python
class OnnxModelManager:
    """Manages ONNX Runtime sessions with LRU eviction and VRAM budget."""

    def get_session(self, model_name: str) -> ort.InferenceSession:
        """Load model if not loaded, evict LRU if over budget."""

    def unload(self, model_name: str) -> None:
        """Manually unload a model."""

    def stats(self) -> dict:
        """Return loaded models, VRAM usage, etc. for /health."""
```

Key behaviors:
- **Lazy loading**: Models load on first request, not at startup
- **LRU eviction**: If VRAM budget exceeded, evict least-recently-used model
- **OOM recovery**: Catch CUDA OOM -> evict least-used model -> retry once
- **Concurrent safety**: Thread-safe model loading with locks
- **Budget**: All required models (~2.5GB FP16) fit in 12GB VRAM simultaneously

### ONNX Session Configuration

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

## BaseEngine

```python
class BaseEngine(ABC):
    """Each engine handles one family of models (e.g. all BiRefNet variants)."""

    @abstractmethod
    def get_models(self) -> list[ModelInfo]:
        """Declare all model variants. ModelInfo: name, onnx_path, vram_mb, required."""

    @abstractmethod
    def run(self, manager: OnnxModelManager, image: np.ndarray, **kwargs) -> dict:
        """Execute inference with full parameters. Returns response dict.
        Engine selects model variant based on kwargs (e.g. model='portrait').
        Handles pre/post processing internally."""
```

Each engine:
- Declares all model variants it supports (required + optional)
- Selects model variant based on request parameters
- Handles its own preprocessing (resize, normalize, pad, tile)
- Handles its own postprocessing (decode output, resize back, blend)
- Returns 400 `MODEL_NOT_FOUND` if requested variant ONNX file is missing

## VRAM Budget

```
RTX 4070 Ti total:          12,288 MB
System/CUDA context:          -500 MB
Available:                  ~11,788 MB
All required models (FP16): ~2,550 MB
Headroom for activations:   ~9,238 MB  (plenty)
```

All required models can stay resident simultaneously.
LRU eviction is a safety net for optional model variants.

## API Contract

See [cortex-api.md](cortex-api.md) for the full endpoint reference.
