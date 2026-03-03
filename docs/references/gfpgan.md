# GFPGAN v1.4 — Face Restoration

## Overview

| Item | Value |
|------|-------|
| Paper | GFP-GAN: Towards Real-World Blind Face Restoration with Generative Facial Prior |
| Repo | https://github.com/TencentARC/GFPGAN |
| License | Apache-2.0 |
| Task | Face restoration / enhancement |

## Full Pipeline

GFPGAN works as a pipeline, not a single model:

1. **Detect faces** (RetinaFace or similar)
2. **Align & crop** each face to 512x512 (affine transform)
3. **GFPGAN inference** on aligned face
4. **Blend** restored with original using `weight` parameter
5. **Paste back** into original image (inverse affine)
6. **Optionally** upscale background with Real-ESRGAN

## Parameters

### GFPGANer init

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| model_path | str | required | Model weights path |
| upscale | int | 2 | Final output upscale factor |
| arch | str | 'clean' | Architecture ('clean' = no CUDA extensions needed) |
| bg_upsampler | module | None | Background upsampler (typically RealESRGANer) |

### enhance() method

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| img | np.ndarray | required | Input BGR image |
| has_aligned | bool | False | Input is pre-aligned 512x512 face |
| only_center_face | bool | False | Only restore largest/center face |
| paste_back | bool | True | Paste restored face back into original |
| weight | float | 0.5 | 0=original, 1=fully restored |

### enhance() returns

```python
cropped_faces, restored_faces, restored_img = restorer.enhance(img)
```

| Output | Type | Notes |
|--------|------|-------|
| cropped_faces | list[np.ndarray] | Original face crops |
| restored_faces | list[np.ndarray] | Restored face crops (1:1 with cropped) |
| restored_img | np.ndarray | Full image with faces restored and pasted back |

## ONNX Model

The ONNX export only covers the GFPGAN network itself (not the full pipeline):

- **Input**: `[1, 3, 512, 512]` float32 normalized aligned face
- **Output**: `[1, 3, 512, 512]` float32 restored face

Face detection, alignment, weight blending, and paste-back must be
implemented in the inference wrapper.

## Required Additional Model

RetinaFace (~100MB) for face detection and landmark alignment.
This is essential for the full pipeline unless `aligned=True`.

## ONNX Sources

- https://huggingface.co/datasets/Gourieff/ReActor/blob/main/models/facerestore_models/GFPGANv1.4.onnx
