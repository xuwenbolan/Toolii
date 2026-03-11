# toolii-backend Module Spec

Status: draft | Updated: 2026-03-10

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

## Error Handling

All routers use `AppError` subclasses (defined in `core/exceptions.py`) — never bare `HTTPException`.

| Exception | Default Status | Usage |
|-----------|---------------|-------|
| `AppError(code, message)` | 400 | Domain errors with machine-readable code |
| `NotFoundError` | 404 | Resource not found |
| `ForbiddenError` | 403 | Permission denied |
| `UnauthorizedError` | 401 | Auth required |

Error codes follow `UPPER_SNAKE_CASE` convention: `FILE_TOO_LARGE`, `INVALID_JSON`, `CORTEX_UNAVAILABLE`, etc.

## Session & Transaction Patterns

- `core/tool_recording.py` and `core/audit_log.py` use an overridable `session_factory` callable for DI (testable without real DB)
- `credit_service._apply_delta()` does not commit — caller manages the transaction boundary
- Services receive async session via FastAPI dependency injection

## Project Structure

```
backend/
├── app/
│   ├── main.py              # Application entry (lifespan context manager)
│   ├── core/                # Config, dependencies, security
│   │   ├── config.py        # Settings (all operational params configurable via env)
│   │   ├── async_utils.py   # Dedicated I/O thread pool (run_sync)
│   │   ├── dependencies.py  # Shared FastAPI deps (tool_credit_cost, tool_owner_user_id)
│   │   ├── exceptions.py    # AppError, NotFoundError, ForbiddenError, UnauthorizedError
│   │   ├── pagination.py    # Single-query pagination with COUNT(*) OVER()
│   │   ├── task_limiter.py  # Async task slot context manager
│   │   ├── upload_limits.py # Shared upload size limit helpers
│   │   ├── tool_recording.py # Tool usage recording (DI session_factory)
│   │   ├── audit_log.py     # Audit log recording (DI session_factory)
│   │   └── rate_limiter.py  # Dynamic rate limiting + IP ban
│   ├── routers/             # API routes
│   ├── services/            # Business logic
│   │   ├── file_result_builder.py  # Unified FileResult construction (free/gated)
│   │   ├── hub_service.py          # File hub: CRUD, quota, expiration
│   │   ├── hub_upload_service.py   # Upload handling, thumbnail generation
│   │   ├── hub_share_service.py    # Share groups, share links
│   │   ├── credit_service.py       # Wallet, transactions, card codes
│   │   ├── admin_dashboard_service.py  # Admin dashboard stats
│   │   ├── admin_user_service.py       # Admin user CRUD + hub settings
│   │   ├── admin_card_service.py       # Admin card code management
│   │   ├── admin_ops_service.py        # Admin operations + audit logs
│   │   ├── admin_transfer_service.py   # Admin hub files + share groups
│   │   └── ...
│   ├── schemas/             # Pydantic models
│   ├── models/              # SQLAlchemy models
│   ├── processing/          # Image/PDF processing logic
│   └── utils/               # Shared utilities
├── cli/                     # Admin CLI tools
├── alembic/                 # Database migrations
└── tests/
```

## Related Specs

- [credits-system.md](credits-system.md) — Credits & card code system
- [user-system.md](user-system.md) — User auth and access control
- [data-compliance.md](data-compliance.md) — Data retention and security
- [backend-cleanup.md](backend-cleanup.md) — Code cleanup tasks
