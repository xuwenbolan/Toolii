# Backend Code Cleanup

Status: done | Updated: 2026-03-03

Synchronized with Cortex integration. Removed duplication, aligned API parameters.

## Completed

### 1. Unified FileResult

`FileResult` moved to `schemas/common.py`, re-exported from `schemas/image.py` and `schemas/pdf.py`.

### 2. Simplified cortex_client.py (177 -> 83 lines)

- Unified `call()` function with `**params` pass-through
- Deleted `detect_faces` (local MediaPipe only)
- Deleted all per-endpoint wrappers
- `remove_background` returns Cortex-compatible dict format even on fallback

### 3. Simplified image_service.py (342 -> 258 lines)

- `_GPU_OPS` config table + generic `_gpu_process()` method
- 7 identical GPU methods replaced with thin wrappers + shared logic
- `inpaint`, `ocr`, `segment` kept as special cases (different return types)

### 4. Updated photo_service.py

- Face detection: local MediaPipe only (no more cortex `detect_faces`)
- Background removal: updated to handle dict return format

### 5. Simplified routers/image.py (308 -> 228 lines)

- `validated_image` FastAPI dependency (generator)
- All single-file endpoints use `Depends(validated_image)`
- `inpaint` keeps manual logic (two file uploads)
- Exposed commonly-used Cortex parameters: model, output_type, task, weight, multimask

### 6. Updated schemas

- `SegmentResult`: now uses `masks: list[SegmentMask]` array format
- `OcrResult`: simplified (engine/lang/width/height moved to meta dict)
- `SegmentMask`: new model (mask_b64, score, low_res_mask_b64)

## Remaining (lower priority)

- Extract landmark conversion helpers (`_lm_px` / `_px`) into `processing/_helpers.py`
- Extract blendshape dict building (duplicated in face_detection.py and face_compliance.py)
- Extract RGBA->RGB background compositing (duplicated in 3+ image files)
