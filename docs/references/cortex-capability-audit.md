# Cortex Capability Audit — 9 Engines / 20 ONNX Models

Status: draft | Updated: 2026-03-05

Full analysis of Cortex engine capabilities vs what is currently exposed through backend and frontend.

## 1. BiRefNet — Background Removal

| Model variant | File | Required | Purpose |
|---|---|---|---|
| birefnet-general | birefnet-general.onnx | Yes | General background removal |
| birefnet-portrait | birefnet-portrait.onnx | No | Portrait-specific, finer edges (hair strands) |
| birefnet-lite | birefnet-lite.onnx | No | Lightweight, faster |
| birefnet-matting | birefnet-matting.onnx | No | Fine matting, returns continuous alpha |

| Parameter | Cortex support | Backend passthrough | Frontend exposed |
|---|---|---|---|
| model (general/portrait/lite/matting) | Yes, 4 variants | Yes | No (hardcoded general) |
| output_type (rgba/mask) | Yes | Yes | No |
| threshold (binarization) | Yes | Yes | No |

## 2. RealESRGAN — Image Upscale

| Model variant | File | Required | Purpose |
|---|---|---|---|
| realesrgan-x4plus | realesrgan-x4plus.onnx | Yes | General 4x upscale (photos) |
| realesrgan-x4v3 | realesrgan-x4v3.onnx | Yes | 4x upscale with adjustable denoise |
| realesrgan-anime | realesrgan-anime.onnx | No | Anime/illustration-specific 4x upscale |

| Parameter | Cortex support | Backend passthrough | Frontend exposed |
|---|---|---|---|
| model (x4plus/x4v3/anime) | Yes, 3 variants | Yes | No (default x4plus) |
| scale (2/4) | Yes | Yes | Yes |
| denoise_strength (0-1, x4v3 only) | Yes, DNI blend | No | No |
| tile_size | Yes | No | No |
| face_enhance (auto GFPGAN) | Yes | No | No |

## 3. GFPGAN — Face Restoration

| Model variant | File | Required | Purpose |
|---|---|---|---|
| gfpgan-v1.4 | gfpgan-v1.4.onnx | Yes | Face restoration main model |
| retinaface | retinaface-resnet50.onnx | Yes | SCRFD face detection (locates faces for GFPGAN) |

| Parameter | Cortex support | Backend passthrough | Frontend exposed |
|---|---|---|---|
| weight (0-1) | Yes | Yes | Yes |
| upscale (1/2/4) | Yes | No (hardcoded 2) | No |
| only_center_face | Yes | No | No |
| bg_upsampler | Yes (defined but not implemented) | No | No |
| aligned | Yes, skip detection | No | No |

## 4. NAFNet — Denoise / Deblur

| Model variant | File | Required | Purpose |
|---|---|---|---|
| nafnet-sidd-w64 | nafnet-sidd-w64.onnx | Yes | Denoise (SIDD dataset, width 64, high quality) |
| nafnet-sidd-w32 | nafnet-sidd-w32.onnx | No | Denoise (lightweight) |
| nafnet-gopro-w64 | nafnet-gopro-w64.onnx | No | Deblur / motion deblur (GoPro dataset) |
| nafnet-gopro-w32 | nafnet-gopro-w32.onnx | No | Deblur (lightweight) |

| Parameter | Cortex support | Backend passthrough | Frontend exposed |
|---|---|---|---|
| task (denoise/deblur) | Yes | Yes | Partial (default denoise, deblur not promoted) |
| strength (0-1) | Yes | Yes | Yes |
| model_width (32/64) | Yes | Yes | No |
| tile_size | Yes | No | No |

## 5. DDColor — Colorization

| Model variant | File | Required | Purpose |
|---|---|---|---|
| ddcolor-artistic | ddcolor-artistic.onnx | Yes | Artistic colorization (vivid) |
| ddcolor-modelscope | ddcolor-modelscope.onnx | No | ModelScope style (realistic) |

| Parameter | Cortex support | Backend passthrough | Frontend exposed |
|---|---|---|---|
| model (artistic/modelscope) | Yes, 2 styles | Yes | No (default artistic) |
| input_size | Yes | No | No |

## 6. LaMa — Large Area Inpainting

| Model | File | Runtime | Purpose |
|---|---|---|---|
| lama | inpaint/lama.onnx | CPU only (FFT ops incompatible with CUDA) | Large area inpainting (mask > 10%) |

Parameters: mask (required), dilate_kernel (optional) — both passed through.

## 7. MI-GAN — Small Area Fast Inpainting

| Model | File | Runtime | Purpose |
|---|---|---|---|
| migan | inpaint/migan.onnx | GPU | Small area inpainting (mask < 10%), fast |

Parameters: same as LaMa. Cortex router auto-routes: mask < 10% -> MI-GAN, >= 10% -> LaMa.

## 8. RapidOCR — Text Recognition

| Model | File | Runtime | Purpose |
|---|---|---|---|
| rapidocr-det | rapidocr-det.onnx | CPU | Text detection |
| rapidocr-cls | rapidocr-cls.onnx | CPU | Direction classification |
| rapidocr-rec | rapidocr-rec.onnx | CPU | Text recognition |

| Parameter | Cortex support | Backend passthrough | Frontend exposed |
|---|---|---|---|
| lang (ch/en/ch_en) | Yes | Yes | Yes |
| det_only | Yes | No | No |
| box_thresh | Yes | No | No |
| text_score | Yes | No | No |
| return_word_box | Yes | No | No |

## 9. MobileSAM — Image Segmentation

| Model | File | Runtime | Purpose |
|---|---|---|---|
| mobilesam-encoder | mobilesam-encoder.onnx | GPU | Image encoding |
| mobilesam-decoder | mobilesam-decoder.onnx | GPU | Prompt decoding to mask |

| Parameter | Cortex support | Backend passthrough | Frontend exposed |
|---|---|---|---|
| points | Yes | Yes | Yes |
| boxes | Yes | Yes | Yes |
| multimask | Yes | Yes | Yes |
| mask_input_b64 (iterative refinement) | Yes | Yes | No |

## Priority Summary: Underutilized Capabilities

### High Value (recommend exposing)

1. **Deblur** — NAFNet gopro models fully supported, backend passes through `task=deblur`. Front end only promotes "denoise". Deblur is a distinct user scenario (motion blur repair) deserving its own tool page or mode switch.

2. **Background removal model selection** — 4 BiRefNet variants each with strengths. Exposing `portrait` improves ID photo / portrait scenarios. `matting` valuable for semi-transparent edges (hair strands).

3. **Upscale face_enhance** — RealESRGAN has built-in "upscale + auto face restore" combo. Very useful for old photo restoration, currently requires two manual steps.

4. **Upscale model selection** — `anime` variant far superior for anime/illustration content. `x4v3` denoise_strength controls noise during upscale.

### Medium Value

5. **Colorization model selection** — artistic vs modelscope produce noticeably different styles. Let users choose or compare.

6. **Face restore upscale parameter** — GFPGAN supports upscale=1/2/4, currently hardcoded to 2. Exposing allows "restore without upscale" (upscale=1).

7. **OCR det_only / box_thresh** — Useful for developers or advanced users.

### Low Value (not recommended)

- tile_size — Internal performance parameter
- mask_input_b64 (SAM iterative refinement) — Requires complex frontend interaction
- threshold (BiRefNet binarization) — Not meaningful for most users
