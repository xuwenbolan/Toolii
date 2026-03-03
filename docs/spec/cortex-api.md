# Cortex GPU Inference Service — API Contract (v1)

Status: final | Updated: 2026-03-03

## Common Conventions

**Base URL**: `http://localhost:9100`

**Request**: `POST /v1/{operation}`, Content-Type: application/json

```json
{
  "image_b64": "<base64 encoded image>",
  ...operation-specific fields
}
```

**Success response** (200):

```json
{
  "image_b64": "<base64 encoded result>",
  "meta": {
    "engine": "birefnet",
    "model": "birefnet-general",
    "elapsed_ms": 142,
    "input_size": [1024, 768],
    "output_size": [1024, 768]
  }
}
```

`meta` is always present. Every endpoint returns at minimum:
`engine`, `model`, `elapsed_ms`, `input_size`, `output_size`.
Endpoints may add extra fields to `meta` (documented per endpoint below).

**Error response** (4xx/5xx):

```json
{
  "error": {
    "code": "MODEL_LOAD_FAILED",
    "message": "Failed to load birefnet model"
  }
}
```

Error codes: `INVALID_INPUT`, `MODEL_LOAD_FAILED`, `MODEL_NOT_FOUND`, `INFERENCE_FAILED`, `CUDA_OOM`.

---

## POST /v1/remove-background

Remove image background. Returns alpha matte or RGBA cutout.

**Request**:

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| image_b64 | string | yes | | Input image (any format) |
| model | string | no | "general" | Model variant (see below) |
| output_type | string | no | "rgba" | `"rgba"` = RGBA PNG cutout, `"mask"` = grayscale alpha matte |
| threshold | float | no | null | Binarization threshold 0.0~1.0. null = soft alpha matte |

Available models:

| model | Use case | Resolution | VRAM |
|-------|----------|------------|------|
| `"general"` | General-purpose object segmentation | 1024x1024 | ~800MB |
| `"portrait"` | Human portrait segmentation | 1024x1024 | ~800MB |
| `"lite"` | Lightweight, faster | 1024x1024 | ~400MB |
| `"matting"` | Trimap-free alpha matting (hair, fur) | 1024x1024 | ~800MB |

**Response**: `image_b64` (RGBA PNG or grayscale mask) + `meta`

Extra `meta` fields: `foreground_ratio`, `threshold_applied`

---

## POST /v1/upscale

Super-resolution image upscaling.

**Request**:

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| image_b64 | string | yes | | Input image |
| model | string | no | "x4plus" | Model variant (see below) |
| scale | int | no | 4 | Final output scale: 2 or 4 |
| denoise_strength | float | no | null | 0.0~1.0, only for `"x4v3"` (DNI blending). null = no denoise |
| tile_size | int | no | 0 | Tile size for large images. 0 = auto |
| face_enhance | bool | no | false | Apply GFPGAN to detected faces before upscaling |

Available models:

| model | Architecture | Best for | Size |
|-------|-------------|----------|------|
| `"x4plus"` | RRDBNet 6B | Photos, quality-first | 64MB |
| `"x4v3"` | Compact VGG | General, fast, supports denoise_strength | 6MB |
| `"anime"` | RRDBNet 6B | Anime/illustration | 64MB |

**Response**: `image_b64` (PNG) + `meta`

Extra `meta` fields: `scale_applied`, `tiles_used`, `face_enhanced`

---

## POST /v1/restore-face

Face detection + restoration + paste-back. Handles multiple faces.

**Request**:

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| image_b64 | string | yes | | Input image (full photo, not pre-cropped) |
| weight | float | no | 0.5 | 0.0~1.0. Blend: 0 = more original, 1 = more restored |
| upscale | int | no | 2 | Output upscale factor: 1, 2, or 4 |
| only_center_face | bool | no | false | Only restore the largest/center face |
| bg_upsampler | bool | no | false | Upscale non-face background with Real-ESRGAN |
| aligned | bool | no | false | Input is pre-aligned 512x512 face (skip detection) |

**Response**: `image_b64` (PNG) + `meta`

Extra `meta` fields: `faces_found` (int), `faces_restored` (int),
`face_boxes` (list of [x1,y1,x2,y2] per detected face)

**Internal pipeline**:
1. Detect faces (RetinaFace ONNX)
2. Align & crop each face to 512x512
3. GFPGAN ONNX inference per face
4. Blend restored face with original using `weight`
5. Paste back into original image
6. Optionally upscale background (Real-ESRGAN)

Models: GFPGAN v1.4 (~330MB), RetinaFace (~100MB)

---

## POST /v1/denoise

Image noise reduction or deblurring.

**Request**:

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| image_b64 | string | yes | | Input image |
| task | string | no | "denoise" | `"denoise"` (SIDD-trained) or `"deblur"` (GoPro-trained) |
| strength | float | no | 1.0 | 0.0~1.0. Blend: output = original*(1-s) + denoised*s |
| model_width | int | no | 64 | Network width: 32 (faster) or 64 (better quality) |
| tile_size | int | no | 0 | Tile size for large images. 0 = auto |

**Response**: `image_b64` (PNG) + `meta`

Extra `meta` fields: `task`, `model_width`, `strength_applied`, `tiles_used`

Note: `strength` is post-processing blend, not a model parameter. NAFNet runs
full inference; blending original and result happens afterward.

Models: NAFNet-SIDD-width64 (~105MB), NAFNet-SIDD-width32 (~30MB),
NAFNet-GoPro-width64 (~105MB), NAFNet-GoPro-width32 (~30MB)

---

## POST /v1/colorize

Colorize grayscale / black-and-white images.

**Request**:

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| image_b64 | string | yes | | Input image |
| model | string | no | "artistic" | Model variant (see below) |
| input_size | int | no | 512 | Internal processing resolution: 256, 384, 512 |

Available models:

| model | Style | Size |
|-------|-------|------|
| `"artistic"` | Vivid colors, fewer artifacts | ~100MB |
| `"modelscope"` | General/neutral | ~200MB |
| `"tiny"` | Fast, lightweight | ~28MB |

**Response**: `image_b64` (PNG) + `meta`

Extra `meta` fields: `input_size_used`

Internal pipeline: RGB -> Lab L-channel -> inference -> predicted ab -> merge with L -> Lab to RGB

---

## POST /v1/inpaint

Content-aware image inpainting.

**Request**:

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| image_b64 | string | yes | | Input image |
| mask_b64 | string | yes | | Mask image. White (255) = region to inpaint |
| model | string | no | "auto" | `"auto"`, `"lama"`, or `"migan"` |
| dilate_kernel | int | no | 0 | Expand mask by N pixels (morphological dilation). 0 = none |

Auto-routing: mask area < 10% of image -> MI-GAN (fast), else -> LaMa (quality).

**Response**: `image_b64` (PNG) + `meta`

Extra `meta` fields: `model_used` ("lama" or "migan"), `mask_area_ratio`, `dilate_applied`

Models: LaMa (102MB), MI-GAN (11MB)

---

## POST /v1/ocr

Optical character recognition. Returns structured text, no image output.

**Request**:

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| image_b64 | string | yes | | Input image |
| lang | string | no | "ch_en" | `"ch"`, `"en"`, `"ch_en"` |
| det_only | bool | no | false | Detection only (return boxes without recognition) |
| box_thresh | float | no | 0.5 | Text box detection confidence 0.0~1.0 |
| text_score | float | no | 0.5 | Text recognition confidence 0.0~1.0 |
| return_word_box | bool | no | false | Return word-level bounding boxes |

**Response**:

```json
{
  "lines": [
    {
      "text": "Hello World",
      "score": 0.98,
      "box": [[x1,y1], [x2,y2], [x3,y3], [x4,y4]],
      "words": [
        {"text": "Hello", "score": 0.99, "box": [[...], ...]},
        {"text": "World", "score": 0.97, "box": [[...], ...]}
      ]
    }
  ],
  "full_text": "Hello World\nLine 2",
  "meta": {
    "engine": "rapidocr",
    "lang": "ch_en",
    "elapsed_ms": 85,
    "input_size": [1024, 768],
    "lines_count": 2,
    "det_only": false
  }
}
```

`words` only present when `return_word_box=true`.
When `det_only=true`, `text` and `score` in each line are empty/zero.

Model: RapidOCR / PP-OCRv4 ONNX (det ~3MB + cls ~2MB + rec ~11MB)

---

## POST /v1/segment

Interactive image segmentation via point/box prompts.

**Request**:

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| image_b64 | string | yes | | Input image |
| points | list | no | null | [[x, y, label], ...] |
| boxes | list | no | null | [[x1, y1, x2, y2], ...] |
| multimask | bool | no | false | Return 3 candidate masks instead of best 1 |
| mask_input_b64 | string | no | null | Previous low-res mask for iterative refinement |

Point labels: `1` = foreground, `0` = background, `2` = box top-left, `3` = box bottom-right.

**Response**:

```json
{
  "masks": [
    {
      "mask_b64": "<base64 PNG>",
      "score": 0.95,
      "low_res_mask_b64": "<base64, 256x256 logits for refinement>"
    }
  ],
  "meta": {
    "engine": "mobilesam",
    "elapsed_ms": 12,
    "input_size": [1024, 768],
    "masks_count": 1
  }
}
```

When `multimask=true`, `masks` contains 3 candidates sorted by score descending.
When `multimask=false` (default), `masks` contains 1 best result.
`low_res_mask_b64` can be passed back as `mask_input_b64` for iterative refinement.

Model: MobileSAM encoder (~5MB) + decoder (~5MB)

---

## GET /health

```json
{
  "status": "ok",
  "gpu": {
    "name": "NVIDIA RTX 4070 Ti",
    "vram_total_mb": 12288,
    "vram_used_mb": 2550,
    "vram_free_mb": 9738,
    "cuda_version": "12.1"
  },
  "models": {
    "loaded": ["birefnet-general", "realesrgan-x4plus"],
    "available": [
      "birefnet-general", "birefnet-portrait", "birefnet-lite", "birefnet-matting",
      "realesrgan-x4plus", "realesrgan-x4v3", "realesrgan-anime",
      "gfpgan-v1.4", "retinaface",
      "nafnet-sidd-w64", "nafnet-sidd-w32", "nafnet-gopro-w64", "nafnet-gopro-w32",
      "ddcolor-artistic", "ddcolor-modelscope", "ddcolor-tiny",
      "lama", "migan",
      "rapidocr-det", "rapidocr-cls", "rapidocr-rec",
      "mobilesam-encoder", "mobilesam-decoder"
    ]
  },
  "uptime_seconds": 3600
}
```
