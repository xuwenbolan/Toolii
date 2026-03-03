# MobileSAM — Interactive Segmentation

## Overview

| Item | Value |
|------|-------|
| Paper | Faster Segment Anything: Towards Lightweight SAM for Mobile Applications |
| Repo | https://github.com/ChaoningZhang/MobileSAM |
| License | Apache-2.0 |
| Task | Prompt-based image segmentation |
| Params | 9.66M (encoder: 5.78M TinyViT) |

## Architecture

Two separate ONNX models:

| Model | Size | Runs | Purpose |
|-------|------|------|---------|
| Encoder (TinyViT) | ~5MB | Once per image | Extract image embeddings |
| Decoder (Prompt + Mask) | ~5MB | Per interaction | Generate mask from prompts |

## Decoder ONNX Inputs

| Input | Shape | Type | Notes |
|-------|-------|------|-------|
| image_embeddings | `[1, 256, 64, 64]` | float32 | From encoder |
| point_coords | `[1, N, 2]` | float32 | Point prompts (scaled to 1024 long edge) |
| point_labels | `[1, N]` | float32 | Point labels (see below) |
| mask_input | `[1, 1, 256, 256]` | float32 | Previous mask for refinement (zeros if none) |
| has_mask_input | `[1]` | float32 | 0.0 or 1.0 |
| orig_im_size | `[2]` | float32 | [height, width] of original image |

### Point Labels

| Value | Meaning |
|-------|---------|
| 1 | Foreground (positive) |
| 0 | Background (negative) |
| 2 | Bounding box top-left corner |
| 3 | Bounding box bottom-right corner |
| -1 | Padding point (when no box input) |

## Decoder ONNX Outputs

### multimask_output=True (default export)

| Output | Shape | Notes |
|--------|-------|-------|
| masks | `[1, 3, H, W]` | 3 candidate masks, resized to original |
| iou_predictions | `[1, 3]` | IoU quality score per mask |
| low_res_masks | `[1, 3, 256, 256]` | Low-res logits for iterative refinement |

### multimask_output=False

| Output | Shape | Notes |
|--------|-------|-------|
| masks | `[1, 1, H, W]` | Single best mask |
| iou_predictions | `[1, 1]` | IoU score |
| low_res_masks | `[1, 1, 256, 256]` | Low-res logits |

## Iterative Refinement

1. First pass: `has_mask_input=0`, `mask_input=zeros`
2. Get `low_res_masks` from output
3. Second pass: `has_mask_input=1`, `mask_input=low_res_masks[best_idx]`
4. Result is more precise

## Mask Threshold

`mask_threshold = 0.0` — output logits > 0 = foreground, <= 0 = background.

## Export Command

```bash
python scripts/export_onnx_model.py \
  --checkpoint ./weights/mobile_sam.pt \
  --model-type vit_t \
  --output ./mobile_sam.onnx \
  --return-single-mask      # optional: single mask output
```

## ONNX Sources

- https://github.com/ChaoningZhang/MobileSAM
- https://github.com/vietanhdev/samexporter
- https://github.com/awarebayes/MobileSamONNX
