# toolii-backend Module Spec

Status: draft | Updated: 2026-03-03

## Role

Business logic, authentication, storage, local CPU processing.
Works as a complete standalone application without Cortex.

## Tech Stack

| Item | Value |
|------|-------|
| Runtime | Python 3.13 |
| Framework | FastAPI + SQLAlchemy async |
| Database | SQLite |
| Package manager | uv |
| Docker image | python:3.13-slim |
| Port | 8000 |

## Ownership

### Backend OWNS

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

### Backend does NOT own

- GPU inference (delegates to Cortex via HTTP)
- Model files for GPU tasks (those live in Cortex)
- Any PyTorch/PaddlePaddle dependency

## Cortex Integration Pattern

```
Backend receives request
  -> GPU task? (upscale, restore-face, denoise, colorize, inpaint, ocr, segment)
     -> Cortex available?  Return GPU result
     -> Cortex unavailable? Return 503 "CORTEX_UNAVAILABLE"
  -> remove-bg?
     -> Cortex available?  Return GPU result (BiRefNet)
     -> Cortex unavailable? Fall back to local rembg silueta
  -> Local task? (compress, convert, mosaic, PDF, face detection...)
     -> Process locally, Cortex not involved
```

**Key rule**: Only `remove-bg` has CPU fallback. All other GPU tasks return 503 cleanly.

## Project Structure

```
backend/
├── app/
│   ├── main.py           # Application entry
│   ├── core/             # Config, dependencies, security
│   ├── routers/          # API routes
│   ├── services/         # Business logic
│   ├── schemas/          # Pydantic models
│   ├── models/           # SQLAlchemy models (future)
│   ├── processing/       # Image/PDF processing logic
│   └── utils/            # Shared utilities
├── cli/                  # Admin CLI tools
├── alembic/              # Database migrations
└── tests/
```

## Related Specs

- [credits-system.md](credits-system.md) — Credits & card code system
- [user-system.md](user-system.md) — User auth and access control
- [data-compliance.md](data-compliance.md) — Data retention and security
- [backend-cleanup.md](backend-cleanup.md) — Code cleanup tasks
