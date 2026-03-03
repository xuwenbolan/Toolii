# Real-ESRGAN — Super Resolution

## Overview

| Item | Value |
|------|-------|
| Paper | Real-ESRGAN: Training Real-World Blind Super-Resolution with Pure Synthetic Data |
| Repo | https://github.com/xinntao/Real-ESRGAN |
| License | BSD-3-Clause |
| Task | Image super-resolution (2x, 4x) |

## Model Variants

| Model | Architecture | Scale | Size | Best for |
|-------|-------------|-------|------|----------|
| RealESRGAN_x4plus | RRDBNet (6 blocks, 64ch) | 4x | 64MB | General photos, quality-first |
| RealESRGAN_x2plus | RRDBNet | 2x | 64MB | 2x upscale |
| realesr-general-x4v3 | VGG-style compact | 4x | 6MB | General, fast, supports DNI |
| RealESRGAN_x4plus_anime_6B | RRDBNet (6 blocks) | 4x | 64MB | Anime/illustration |

## Key Parameters

### RealESRGANer (wrapper class)

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| scale | int | required | Network upscale factor (2 or 4) |
| tile | int | 0 | Tile size, 0=no tiling. Solves OOM for large images |
| tile_pad | int | 10 | Tile edge padding to avoid seam artifacts |
| pre_pad | int | 10 | Input boundary padding |
| half | bool | False | FP16 inference |
| dni_weight | list | None | Deep Network Interpolation weights (for x4v3) |

### enhance() method

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| img | np.ndarray | required | Input BGR uint8 |
| outscale | float | None | Final output scale (independent of network scale) |
| alpha_upsampler | str | 'realesrgan' | Alpha channel upscale method |

### denoise_strength (x4v3 only)

For `realesr-general-x4v3`, denoise strength is implemented via DNI (Deep Network
Interpolation) between denoise model and no-denoise model. 0 = weak, 1 = strong.

## ONNX Format

- **Input**: `[1, 3, H, W]` float32 RGB
- **Output**: `[1, 3, H*scale, W*scale]` float32 upscaled RGB
- Tiling must be implemented in the inference wrapper, not the model itself.

## ONNX Sources

- https://huggingface.co/qualcomm/Real-ESRGAN-x4plus
- Export via: https://github.com/instant-high/real-esrgan-onnx
