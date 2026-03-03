# LaMa & MI-GAN — Image Inpainting

## LaMa

### Overview

| Item | Value |
|------|-------|
| Paper | Resolution-Robust Large Mask Inpainting with Fourier Convolutions |
| Repo | https://github.com/advimman/lama |
| License | Apache-2.0 |
| Best for | Large mask areas (>10% of image) |

### ONNX Format

| Tensor | Shape | Notes |
|--------|-------|-------|
| Input image | `[1, 3, 512, 512]` float32 | RGB normalized |
| Input mask | `[1, 1, 512, 512]` float32 | Binary: `(mask > 0) * 1.0`, white = inpaint |
| Output | `[1, 3, 512, 512]` float32 | Inpainted result |

Fixed 512x512 resolution. Large images need crop or resize strategy.

### Large Image Strategies (from IOPaint)

| Strategy | Description |
|----------|-------------|
| Original | Process at original resolution (may fail if too large) |
| Resize | Resize to max dimension, inpaint, resize back |
| Crop | Crop around mask region with margin, inpaint, paste back |

### ONNX Sources

- https://huggingface.co/Carve/LaMa-ONNX
- https://huggingface.co/opencv/inpainting_lama

---

## MI-GAN

### Overview

| Item | Value |
|------|-------|
| Paper | MI-GAN: A Simple Baseline for Image Inpainting on Mobile Devices |
| Repo | https://github.com/Picsart-AI-Research/MI-GAN |
| License | MIT |
| Best for | Small mask areas (<10% of image), fast inference |

### ONNX Format

| Tensor | Notes |
|--------|-------|
| Input image | uint8 RGB |
| Input mask | uint8 grayscale |
| Output | Inpainted result |

**Important**: MI-GAN mask semantics are INVERTED from LaMa:
- MI-GAN: white (255) = known area, black (0) = inpaint area
- LaMa: white (255) = inpaint area, black (0) = known area

The Cortex engine must normalize mask semantics to a consistent convention
(API uses LaMa convention: white = inpaint).

### Export Options

| Param | Notes |
|-------|-------|
| --resolution | 256 or 512 |
| --invert-mask | Flip mask black/white |

---

## Routing Logic

In the Cortex inpaint endpoint, `model="auto"` routes by mask area ratio:

```python
mask_ratio = mask_white_pixels / total_pixels
if mask_ratio < 0.10:
    use MI-GAN (fast, good for small edits)
else:
    use LaMa (quality, handles large masks)
```

## Mask Dilation

Optional `dilate_kernel` parameter expands the mask before inpainting:
```python
if dilate_kernel > 0:
    kernel = np.ones((dilate_kernel, dilate_kernel), np.uint8)
    mask = cv2.dilate(mask, kernel, iterations=1)
```
