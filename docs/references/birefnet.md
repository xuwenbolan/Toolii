# BiRefNet — Background Removal

## Overview

| Item | Value |
|------|-------|
| Paper | Bilateral Reference for High-Resolution Dichotomous Image Segmentation |
| Repo | https://github.com/ZhengPeng7/BiRefNet |
| License | MIT |
| Task | Binary image segmentation / alpha matting |

## Model Variants

| Variant | Training Data | Resolution | Notes |
|---------|--------------|------------|-------|
| BiRefNet (general) | DIS5K + HRSOD + etc. | 1024x1024 | General-purpose, recommended default |
| BiRefNet-portrait | Portrait dataset | 1024x1024 | Human portrait segmentation |
| BiRefNet_lite | Same as general | 1024x1024 | Lighter architecture |
| BiRefNet-matting | Matting datasets | 1024x1024 | Trimap-free alpha matting |
| BiRefNet_HR | Same as general | 2048x2048 | High resolution |
| BiRefNet_dynamic | Same as general | 256~2304 | Dynamic resolution |

## ONNX Format

- **Input**: `pixel_values` shape `[1, 3, H, W]`, float32, RGB normalized
- **Output**: `output` shape `[1, 1, H, W]`, needs `sigmoid()` to get 0~1 alpha
- **Post-processing**: `sigmoid(output).mul(255).to(uint8)`, resize to original size

## ONNX Sources (HuggingFace)

- https://huggingface.co/onnx-community/BiRefNet-ONNX
- https://huggingface.co/onnx-community/BiRefNet-portrait-ONNX
- https://huggingface.co/onnx-community/BiRefNet_lite-ONNX

## Implementation Notes

- Output is continuous alpha (soft matte), not binary. Binarize with threshold if needed.
- For production: pre-convert to FP16, performance nearly identical.
- ONNX dynamic batch has compatibility issues; use batch=1.
- rembg library wraps BiRefNet variants and handles pre/post processing.
