# Toolii Cortex: Implementation Plan

This plan references the detailed specifications in `/docs/spec/` and `/docs/references/`.

## Specifications (source of truth)

- [/docs/spec/architecture.md](/docs/spec/architecture.md) — System architecture, module boundaries
- [/docs/spec/toolii-cortex.md](/docs/spec/toolii-cortex.md) — Cortex module: engines, ModelManager
- [/docs/spec/cortex-api.md](/docs/spec/cortex-api.md) — API contract v1 with full model parameters
- [/docs/spec/models.md](/docs/spec/models.md) — Model storage layout, required/optional variants
- [/docs/spec/docker.md](/docs/spec/docker.md) — Docker deployment
- [/docs/spec/backend-cleanup.md](/docs/spec/backend-cleanup.md) — Backend code cleanup

## Architecture Decisions

- **Inference engine**: ONNX Runtime + CUDA EP (no TensorRT)
- **Target GPU**: NVIDIA RTX 4070 Ti (12GB VRAM, Ada Lovelace SM89)
- **Model scheduling**: LRU ModelManager with VRAM budget
- **FP16**: Pre-convert ONNX models offline using onnxconverter-common
- **API design**: Expose full model capabilities, not Backend-tailored subset

## Implementation Order

### Phase 1: Cortex skeleton

1. Create `cortex/` directory structure
2. `pyproject.toml` with dependencies (onnxruntime-gpu, fastapi, uvicorn, pillow, numpy)
3. `app/config.py` — Settings (model_dir, vram_budget, port)
4. `app/model_manager.py` — OnnxModelManager (lazy load, LRU evict, OOM recovery)
5. `app/engines/base.py` — BaseEngine ABC
6. `app/main.py` — FastAPI app with /health endpoint
7. `app/router.py` — Endpoint dispatch skeleton

### Phase 2: First engines (validate architecture)

8. `engines/birefnet.py` — Background removal (most-used, Backend has CPU fallback for testing)
9. `engines/realesrgan.py` — Super resolution (simple pre/post, validates tiling)
10. `scripts/download_models.py` — Download from HuggingFace
11. Test against Backend cortex_client.py

### Phase 3: Remaining engines

12. `engines/gfpgan.py` — Face restoration (complex: RetinaFace + align + paste-back)
13. `engines/nafnet.py` — Denoise / deblur (with tiling + strength blend)
14. `engines/ddcolor.py` — Colorization (Lab color space pipeline)
15. `engines/lama.py` + `engines/migan.py` — Inpainting (mask routing + semantics)
16. `engines/rapidocr.py` — OCR (3-model pipeline)
17. `engines/mobilesam.py` — Segmentation (encoder + decoder, iterative refinement)

### Phase 4: Backend sync

18. Simplify `cortex_client.py` (unified `_call`, `**params` pass-through)
19. Simplify `image_service.py` (config table + generic GPU method)
20. Simplify `routers/image.py` (dependency extraction)
21. Update API parameters to match Cortex contract
22. Unify `FileResult` to `schemas/common.py`

### Phase 5: Docker & deployment

23. `docker/Dockerfile.cortex`
24. `docker/docker-compose.cortex.yml`
25. Test full stack: web -> backend -> cortex

## Migration Notes

- Backend cortex_client.py will use `**params` pass-through, so API changes are additive
- `remove-bg` keeps CPU fallback (rembg silueta) in Backend
- All other GPU tools return 503 when Cortex is unavailable
- GFPGAN `weight` parameter is valid (was incorrectly planned for removal)
- NAFNet `strength` is post-processing blend (valid, kept)
- MI-GAN mask semantics are inverted from LaMa — engine normalizes internally
