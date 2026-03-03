# System Architecture

Status: draft | Updated: 2026-03-03

---

## Architecture Overview

```
                    +-----------+
  User  <------->  | toolii-web|  (nginx + React SPA)
                    +-----+-----+
                          | /api/*
                    +-----v------+           +---------------+
                    |toolii-     |  HTTP     | toolii-cortex |
                    |backend     +---------->| (GPU, optional)|
                    +------------+           +---------------+
                    port 8000                port 9100
```

Three independent Docker containers. Backend works standalone; Cortex is an optional
GPU enhancement — when unavailable, Backend either uses local CPU fallback or returns
503 to let the frontend show "GPU service unavailable".

---

## Module Boundaries

### toolii-web

**Role**: Static SPA + reverse proxy

| Item | Value |
|------|-------|
| Tech | React 18 + TypeScript + Vite, served by nginx |
| Docker | nginx:1.27-alpine |
| Port | 8001 (external) |
| Responsibilities | Serve frontend assets, proxy `/api/*` to backend |

No business logic. No direct communication with Cortex.

### toolii-backend

**Role**: Business logic, auth, storage, local CPU processing

| Item | Value |
|------|-------|
| Tech | Python 3.13 + FastAPI + SQLAlchemy async |
| Docker | python:3.13-slim |
| Port | 8000 |
| Package manager | uv |

**Backend owns:**
- User auth (JWT, OAuth, email verification)
- Credit system (wallet, transactions, card codes, sharing)
- File storage (upload, download, signed URLs, TTL cleanup)
- Tool registry and rate limiting
- Processing history and admin panel
- Local CPU processing (compress, convert, mosaic, scan-enhance, PDF ops)
- Face detection (MediaPipe) and face similarity (FaceNet512 ONNX on CPU)
- Physiognomy analysis (MediaPipe landmarks + rule engine)
- ID photo pipeline (detect, crop, compliance check, layout)
- Background removal local fallback (rembg silueta)

**Backend does NOT own:**
- GPU inference — delegates to Cortex via HTTP
- Model files for GPU tasks — those live in Cortex
- Any PyTorch/PaddlePaddle dependency

### toolii-cortex

**Role**: Stateless GPU inference service. No auth, no storage, no business logic.

| Item | Value |
|------|-------|
| Tech | Python 3.13 + FastAPI + ONNX Runtime GPU |
| Docker | nvidia/cuda base + onnxruntime-gpu |
| Port | 9100 |
| GPU | NVIDIA RTX 4070 Ti (12GB VRAM) |
| Package manager | uv |

**Cortex owns:**
- ONNX model loading and lifecycle (ModelManager with LRU eviction)
- VRAM budget management
- Pre/post processing for each model (resize, normalize, decode output)
- Model download script

**Cortex does NOT own:**
- User auth or rate limiting (Backend handles before calling Cortex)
- File storage or signed URLs
- Any business logic or credit deduction
- Background removal fallback (Backend's responsibility)

**Cortex is pure function:**
```
Input:  image bytes (base64) + optional parameters
Output: processed image bytes (base64) + metadata
```
No side effects. No state beyond loaded models. Can be restarted without data loss.

---

## Cortex Integration Pattern

```
Backend receives request
  -> Is this a GPU task? (upscale, restore-face, denoise, colorize, inpaint, ocr, segment)
     YES -> Call Cortex HTTP API
            -> Cortex available? Return GPU result
            -> Cortex unavailable? Return 503 with code "CORTEX_UNAVAILABLE"
  -> Is this remove-bg?
     YES -> Call Cortex first
            -> Cortex available? Return GPU result (BiRefNet, better quality)
            -> Cortex unavailable? Fall back to local rembg silueta (still works, lower quality)
  -> Is this a local task? (compress, convert, mosaic, scan-enhance, PDF, face detection...)
     YES -> Process locally, Cortex not involved
```

**Key rule**: Only `remove-bg` has a local fallback. All other GPU tasks (upscale, restore-face,
denoise, colorize, inpaint, ocr, segment) require Cortex — no local fallback, return 503 cleanly.

---

## Responsibility Matrix

|  | toolii-web | toolii-backend | toolii-cortex |
|--|-----------|---------------|--------------|
| Auth/users | - | YES | - |
| Credits/billing | - | YES | - |
| File storage | - | YES | - |
| Rate limiting | - | YES | - |
| Local image ops (compress/convert/mosaic) | - | YES | - |
| Local face detection (MediaPipe) | - | YES | - |
| Local face similarity (FaceNet CPU) | - | YES | - |
| Local background removal (rembg) | - | YES (fallback) | - |
| PDF processing | - | YES | - |
| ID photo pipeline | - | YES | - |
| Physiognomy analysis | - | YES | - |
| GPU background removal (BiRefNet) | - | - | YES |
| GPU upscale (Real-ESRGAN) | - | - | YES |
| GPU face restore (GFPGAN) | - | - | YES |
| GPU denoise (NAFNet) | - | - | YES |
| GPU colorize (DDColor) | - | - | YES |
| GPU inpaint (LaMa/MI-GAN) | - | - | YES |
| GPU OCR (RapidOCR) | - | - | YES |
| GPU segment (MobileSAM) | - | - | YES |
| VRAM management | - | - | YES |
| Model lifecycle | - | - | YES |

---

## Tech Stack

| Layer | Tech | Rationale |
|-------|------|-----------|
| Frontend framework | React + Vite | High dev efficiency, fast bundling |
| UI styling | TailwindCSS | Mobile-friendly, atomic CSS |
| Backend framework | FastAPI | Async high-performance, built-in API docs |
| Language version | Python 3.13 | Latest stable |
| Package manager | uv | Ultra-fast dependency management |
| Database | SQLite | Lightweight single-file, zero maintenance, fits project scale |
| Image processing | Pillow + rembg | Mature Python ecosystem |
| Background removal | rembg (multi-model) | Supports silueta/u2net/birefnet tiers |
| Face detection | MediaPipe | Google open-source, high accuracy |
| PDF processing | pikepdf / PyPDF2 | Python native, full-featured |
| HEIC conversion | pillow-heif | Python native Apple format support |
| Scan enhancement | OpenCV | Crop, perspective correction, shadow removal |
| User auth | Google OAuth + email/password | OAuth zero cost, email/password zero dependency |
| i18n | i18n (Chinese only initially) | Architecture supports multi-language, Chinese first |
| Analytics | Google Analytics | Free, launch-ready, requires Cookie consent |
| Cookie consent | Frontend Cookie Banner | GDPR compliance, required for UK/EU deployment |
| Deployment | Docker (UK/EU region) | Containerized, environment consistency |
| Domain | Cloudflare hosted | Free DNS + SSL |

---

## Docker Architecture

See [docker.md](docker.md) for full deployment spec.

All Docker configs in root `docker/` directory:
- `docker-compose.yml` — backend + web (always runs)
- `docker-compose.cortex.yml` — cortex GPU service (separate lifecycle)
- `Dockerfile` — multi-stage for backend + web
- `Dockerfile.cortex` — cortex GPU image

---

## Model Storage

See [models.md](models.md) for full model layout with all variants.

Required models (~1.6GB), optional models (~2.5GB additional).
Git-ignored. Volume-mounted into containers.

---

## Project Structure

```
Toolii/
├── backend/                  # FastAPI backend
│   ├── app/
│   │   ├── main.py           # Application entry
│   │   ├── routers/          # API routes (ID photo, image, PDF)
│   │   ├── services/         # Business logic
│   │   ├── models/           # Database models
│   │   └── core/             # Config, dependencies
│   └── tests/                # Backend tests
├── frontend/                 # React frontend
│   ├── src/
│   ├── public/
│   └── package.json
├── docker/                   # All Docker configs (unified)
│   ├── Dockerfile            # Multi-stage: backend + web targets
│   ├── Dockerfile.cortex     # Cortex GPU service
│   ├── docker-compose.yml    # backend + web
│   ├── docker-compose.cortex.yml  # Cortex (separate lifecycle)
│   └── nginx.conf
├── models/                   # AI model files (git-ignored, Docker volume mount)
│   ├── facenet512.onnx
│   └── cortex/
├── data/                     # Data directory (git-ignored)
│   ├── uploads/              # User uploaded files
│   └── toolii.db             # SQLite database
├── docs/                     # Project documentation
│   ├── spec/                 # Specifications by module
│   └── references/           # Research data and references
├── .claude/plans/            # Implementation plans
├── pyproject.toml            # Python dependencies (uv)
└── CLAUDE.md                 # Claude Code configuration
```
