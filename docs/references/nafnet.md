# NAFNet — Image Denoising & Deblurring

## Overview

| Item | Value |
|------|-------|
| Paper | Simple Baselines for Image Restoration |
| Repo | https://github.com/megvii-research/NAFNet |
| License | MIT |
| Task | Image denoising (SIDD) and deblurring (GoPro) |

## Model Variants

| Model | Task | Width | PSNR | Size |
|-------|------|-------|------|------|
| NAFNet-SIDD-width64 | Denoise | 64 | 40.30 dB (SOTA) | ~105MB |
| NAFNet-SIDD-width32 | Denoise | 32 | 39.73 dB | ~30MB |
| NAFNet-GoPro-width64 | Deblur | 64 | 33.69 dB | ~105MB |
| NAFNet-GoPro-width32 | Deblur | 32 | 33.25 dB | ~30MB |

`width` = base feature channels. width64 is higher quality but more VRAM.

## ONNX Format

- **Input**: `[1, 3, H, W]` float32 RGB
- **Output**: `[1, 3, H, W]` float32 (same size, denoised/deblurred)

## Implementation Notes

### Tiling

ONNX export may have fixed input size. Large images require tiling:
- Split into fixed-size tiles with overlap/padding
- Run inference per tile
- Merge tiles, blending in overlap regions

### Strength Control

NAFNet has no native strength parameter. Implement via post-processing blend:
```python
output = original * (1 - strength) + denoised * strength
```

## ONNX Sources

- https://huggingface.co/mikestealth/nafnet-models
- Export via nafnetlib: https://github.com/mikecokina/nafnetlib
