# Toolii Specification Index

All specifications are organized by module. Each file covers one module or cross-cutting concern.

## Project Overview

- [overview.md](overview.md) — Project overview, target users, success metrics, cost analysis

## System Architecture

- [architecture.md](architecture.md) — System topology, module boundaries, tech stack, integration pattern

## Module Specifications

- [toolii-web.md](toolii-web.md) — Frontend: React SPA + nginx reverse proxy
- [toolii-backend.md](toolii-backend.md) — Backend: business logic, auth, storage, CPU processing
- [toolii-cortex.md](toolii-cortex.md) — Cortex: GPU inference, ModelManager, engine architecture

## Cortex GPU Service

- [cortex-api.md](cortex-api.md) — API contract v1: all endpoints with full model parameters
- [models.md](models.md) — ONNX model storage layout, required/optional variants, FP16

## Infrastructure

- [docker.md](docker.md) — Docker deployment: containers, compose files, Dockerfile specs
- [backend-cleanup.md](backend-cleanup.md) — Backend code deduplication and parameter alignment

## Feature Specifications

- [id-photo.md](id-photo.md) — ID photo processing (face detection, background removal, compliance, layout)
- [image-tools.md](image-tools.md) — Image tools (compress, convert, HEIC, mosaic, scan enhance)
- [file-tools.md](file-tools.md) — File/PDF tools (compress, merge, split, page ops, image-to-PDF)
- [user-system.md](user-system.md) — User system (auth, OAuth, history, referral)
- [credits-system.md](credits-system.md) — Credits & card code system (pricing, redemption, sharing)
- [video-tools.md](video-tools.md) — Video & audio tools (compress, convert, GIF, trim, extract audio)
- [file-hub.md](file-hub.md) — File hub (unified file management + sharing, replaces file transfer & file locker)
- [md-editor.md](md-editor.md) — Markdown online editor (WYSIWYG editing + share preview, built on File Hub)
- ~~[file-locker.md](file-locker.md)~~ — Outdated, superseded by file-hub.md
- [visa-service.md](visa-service.md) — Visa materials full-service workflow

## Compliance & Security

- [data-compliance.md](data-compliance.md) — Data types, retention, GDPR, security, Cookie consent

## Frontend

- [frontend-design.md](frontend-design.md) — Visual identity, interaction patterns, design tokens, page design
- [frontend-upgrade.md](frontend-upgrade.md) — Frontend upgrade roadmap (phases 0-6)
- [cortex-dashboard.md](cortex-dashboard.md) — Cortex dashboard visualization and management enhancement
- [tools/](tools/) — Per-tool interaction design (one file per tool):
  - [compress.md](tools/compress.md), [mosaic.md](tools/mosaic.md), [remove-bg.md](tools/remove-bg.md), [scan-enhance.md](tools/scan-enhance.md), [format-convert.md](tools/format-convert.md), [pdf-tools.md](tools/pdf-tools.md), [id-photo.md](tools/id-photo.md), [word-counter.md](tools/word-counter.md)
  - [file-progress.md](tools/file-progress.md) -- Universal upload/download progress components
  - Video/audio tool interaction design: TBD

## Business

- [monetization.md](monetization.md) — Monetization model, pricing, revenue projections
- [marketing.md](marketing.md) — Launch strategy, growth channels, content marketing

## Model Research References

Detailed per-model technical data in [/docs/references/](../references/):

- [birefnet.md](../references/birefnet.md) — BiRefNet variants, ONNX format, sources
- [realesrgan.md](../references/realesrgan.md) — Real-ESRGAN models, DNI, tiling
- [gfpgan.md](../references/gfpgan.md) — GFPGAN pipeline, parameters, RetinaFace
- [nafnet.md](../references/nafnet.md) — NAFNet denoise/deblur variants, tiling
- [ddcolor.md](../references/ddcolor.md) — DDColor models, Lab pipeline, export
- [inpainting.md](../references/inpainting.md) — LaMa + MI-GAN, mask semantics, routing
- [rapidocr.md](../references/rapidocr.md) — RapidOCR pipeline, det/cls/rec parameters
- [mobilesam.md](../references/mobilesam.md) — MobileSAM encoder/decoder, iterative refinement
- [cortex-capability-audit.md](../references/cortex-capability-audit.md) — Full audit of 9 engines / 20 models: exposed vs hidden capabilities
