# RapidOCR — Optical Character Recognition

## Overview

| Item | Value |
|------|-------|
| Repo | https://github.com/RapidAI/RapidOCR |
| License | Apache-2.0 |
| Base models | PP-OCRv4 (PaddleOCR ONNX weights) |
| Task | Text detection + classification + recognition |

## Architecture

Three-stage pipeline, each a separate ONNX model:

| Stage | Model | Size | Purpose |
|-------|-------|------|---------|
| Detection (det) | PP-OCRv4 det | ~3MB | Locate text regions in image |
| Classification (cls) | PP-OCRv4 cls | ~2MB | Determine text orientation (0/180) |
| Recognition (rec) | PP-OCRv4 rec | ~11MB | Read text from detected regions |

## API Parameters

### Initialization

| Param | Type | Notes |
|-------|------|-------|
| det_model_path | str | Detection model path |
| rec_model_path | str | Recognition model path |
| cls_model_path | str | Classification model path |
| text_score | float | Global confidence threshold (default 0.5) |

### __call__ method

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| img | any | required | Image (path, ndarray, bytes, PIL) |
| use_det | bool | True | Enable text detection |
| use_cls | bool | True | Enable orientation classification |
| use_rec | bool | True | Enable text recognition |
| return_word_box | bool | False | Word-level bounding boxes |
| return_single_char_box | bool | False | Character-level boxes |

### Detection parameters

| Param | Default | Notes |
|-------|---------|-------|
| limit_side_len | 736 | Max side length for detection |
| thresh | 0.3 | Segmentation probability threshold |
| box_thresh | 0.5 | Text box confidence threshold |
| max_candidates | 1000 | Max detection candidates |
| unclip_ratio | 1.6 | Text box expansion ratio |
| use_dilation | True | Morphological dilation on seg map |

## Output Structure

```python
result = engine(img)
result.boxes    # np.ndarray shape (N, 4, 2) — N text boxes, 4 corners each
result.txts     # list[str] — recognized text per box
result.scores   # list[float] — confidence per box
result.elapse   # float — total processing time
```

## det_only Mode

Set `use_rec=False` to only detect text regions without recognition.
Returns boxes only; txts and scores are empty.

## ONNX Sources

- Bundled with `rapidocr-onnxruntime` pip package
- https://github.com/RapidAI/RapidOCR
