# DDColor — Image Colorization

## Overview

| Item | Value |
|------|-------|
| Paper | DDColor: Towards Photo-Realistic Image Colorization via Dual Decoders |
| Repo | https://github.com/piddnad/DDColor |
| License | Apache-2.0 |
| Task | Automatic B&W to color conversion |

## Model Variants

| Model | Encoder | Params | Size | Style |
|-------|---------|--------|------|-------|
| ddcolor_artistic | ConvNeXt-L | 198M | ~100MB | Vivid, fewer artifacts |
| ddcolor_modelscope | ConvNeXt-L | 198M | ~200MB | General/neutral |
| ddcolor_paper | ConvNeXt-L | 198M | ~200MB | Paper reproduction |
| ddcolor_paper_tiny | ConvNeXt-T | 28M | ~28MB | Lightweight |

## Architecture Parameters

| Param | Default | Notes |
|-------|---------|-------|
| encoder_name | convnext-l | convnext-t / -s / -b / -l |
| decoder_name | MultiScaleColorDecoder | or SingleColorDecoder |
| num_queries | 100 | Learnable color queries |
| input_size | (256, 256) | Internal processing resolution |
| num_output_channels | 2 | Lab ab channels |

## ONNX Format

- **Input**: `[1, 3, input_size, input_size]` float32, Lab L-channel (normalized)
- **Output**: `[1, 2, input_size, input_size]` float32, Lab ab channels

## Processing Pipeline

1. Load image, convert RGB -> Lab
2. Extract L channel, resize to `input_size`
3. Run ONNX inference -> get predicted ab
4. Merge L + predicted ab
5. Convert Lab -> RGB
6. Resize back to original dimensions

## ONNX Export

```bash
python scripts/export_onnx.py \
  --model_path pretrain/ddcolor_artistic.pth \
  --export_path weights/ddcolor-artistic.onnx \
  --input_size 512 \
  --model_size large \
  --decoder_type MultiScaleColorDecoder
```

`input_size` can be 256, 384, or 512. Larger = better detail but slower.

## ONNX Sources

- Export script in repo: https://github.com/piddnad/DDColor/blob/master/scripts/export_onnx.py
- Also: https://github.com/instant-high/DDColor-onnx
