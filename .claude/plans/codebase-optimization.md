# Codebase Optimization & Refactoring Plan

Status: final | Updated: 2026-03-10

## Background

Project has grown to a significant feature surface. Before adding new features, address accumulated technical debt across 4 categories: frontend bundle/component bloat, backend interface duplication, cortex single-file complexity, and test contract drift.

---

## Phase 1 — Fix Broken Contracts & Critical Bugs

> Goal: Make the codebase green again, fix things that are actively broken.

### 1.1 Fix backend test collection failure
- **Root cause**: `test_face_similarity.py:8-15` imports `_crop_region`, `_REGIONS` from `face_similarity.py`, which no longer exports them
- **Action**: Update or remove broken test imports, ensure `pytest -q` passes collection
- **Files**: `backend/tests/test_face_similarity.py`, `backend/app/processing/face_similarity.py`

### 1.2 Replace deprecated FastAPI `on_event`
- **Root cause**: `main.py:103` and `main.py:128` use `@app.on_event("startup"/"shutdown")` which is deprecated
- **Action**: Migrate to `lifespan` context manager pattern
- **Files**: `backend/app/main.py`

### 1.3 Fix token blacklist double-query
- **Root cause**: `dependencies.py:36-39` checks in-memory cache then unconditionally queries DB
- **Action**: Short-circuit return when in-memory cache hits
- **Files**: `backend/app/core/dependencies.py`

---

## Phase 2 — Backend Deduplication & Boundary Cleanup

> Goal: Reduce repetition in routers, split oversized services, add missing indexes.

### 2.1 Extract repeated router helpers to dependencies
- `_credit_cost()`, `_owner_user_id()` duplicated in image.py, pdf.py, photo.py
- Task slot acquire/release pattern (try/finally) repeated in 3+ routers
- **Action**: Move to `core/dependencies.py`, create `@contextmanager task_slot()`
- **Files**: `backend/app/core/dependencies.py`, `backend/app/routers/image.py`, `pdf.py`, `photo.py`

### 2.2 Split hub_service.py (1200+ lines) ✅
- Split into `hub_upload_service.py` and `hub_share_service.py`
- Core hub_service.py narrowed to file CRUD, quota, expiration
- Narrowed `except Exception` → `except OSError` for file deletion operations

### 2.3 Add missing database indexes -- partially done
- Added composite `(tool_name, user_id, created_at)` on `processing_history`
- Added composite `(user_id, status)` on `user_files`
- Alembic migration: `r2s3t4u5v6w7_add_composite_indexes.py`
- **Files**: `backend/app/models/processing_history.py`, `user_file.py`

### 2.4 Optimize pagination query pattern -- done
- Replaced 2-query pagination with single query using `COUNT(*) OVER()` window function
- Created `core/pagination.py` with reusable `paginate()` helper
- **Files**: `backend/app/core/pagination.py`, `services/history_service.py`, `services/credit_service.py`

### 2.5 Standardize error responses ✅
- All routers converted from `HTTPException` to `AppError`/`NotFoundError`/`ForbiddenError`
- **Files changed**: `image.py`, `pdf.py`, `photo.py`, `face_reading.py`, `download.py`, `hub.py`, `result_share.py`
- Only `admin/files.py` retains 1 HTTPException (not in scope)

### 2.6 Bound global mutable caches
- `_violations` in rate_limiter.py, `_cache` in tool_service.py, `_semaphores` in task_limiter.py
- **Action**: Replace with `cachetools.TTLCache` or add max-size + eviction
- **Files**: `backend/app/core/rate_limiter.py`, `task_limiter.py`, `services/tool_service.py`

### 2.7 Narrow broad exception handlers ✅
- `tool_recording.py`: 3x `except Exception` → `SQLAlchemyError` / `(SQLAlchemyError, OSError)`
- `admin/system.py`: 8x `except Exception` → `(AppError, httpx.HTTPError)`
- `download.py`: silent `except: pass` → log warning
- `audit_log.py`: kept broad but added `noqa: BLE001` documenting fire-and-forget intent
- **Files**: `backend/app/core/tool_recording.py`, `audit_log.py`, `routers/admin/system.py`, `routers/download.py`

### 2.8 Simplify credit_service transaction handling ✅
- Removed nested `_run()` closure in `_apply_delta`, flattened control flow
- `autocommit=False` no longer rollbacks on `AppError` (caller's responsibility)
- Removed dead-code `except AppError` branches in `add()` / `consume()`
- **Files**: `backend/app/services/credit_service.py`

### 2.9 Deduplicate _to_user_public ✅
- Identical function in `auth.py` and `users.py` → `UserPublic.from_user()` classmethod
- **Files**: `backend/app/schemas/user.py`, `routers/auth.py`, `routers/users.py`

### 2.10 Extract upload size limits ✅
- Deduplicated `_max_image_bytes()` / `_max_pdf_bytes()` from 5 routers into `core/upload_limits.py`
- **Files**: `core/upload_limits.py`, `routers/image.py`, `pdf.py`, `photo.py`, `face_reading.py`, `result_share.py`

### 2.11 Dedicated I/O thread pool ✅
- Replaced scattered `loop.run_in_executor(None, ...)` with dedicated `core/async_utils.py`
- `run_sync(fn, *args, **kwargs)` runs blocking functions in a 20-worker thread pool
- Updated `image_service.py`, `pdf_service.py`
- **Files**: `core/async_utils.py`, `services/image_service.py`, `services/pdf_service.py`

### 2.12 Extract FileResultBuilder ✅
- Unified FileResult construction logic from ImageService and PdfService into `services/file_result_builder.py`
- Handles free/gated results, watermark generation, meta dict construction
- **Files**: `services/file_result_builder.py`, `services/image_service.py`, `services/pdf_service.py`

### 2.13 Split admin_service.py (1063 lines) ✅
- Split monolithic `AdminService` into 5 focused sub-services:
  - `admin_dashboard_service.py` — dashboard stats (1 method)
  - `admin_user_service.py` — user CRUD, hub settings, credits (5 methods + 2 helpers)
  - `admin_card_service.py` — card code management (4 methods)
  - `admin_ops_service.py` — tool usage, transactions, share links, revenue, processing history, audit logs (6 methods)
  - `admin_transfer_service.py` — hub files, share groups, result shares (6 methods)
- Updated 6 admin routers: `dashboard.py`, `users.py`, `cards.py`, `operations.py`, `transfers.py`, `audit.py`
- Deleted monolithic `admin_service.py`

### 2.14 Cortex router extract common helpers ✅
- Extracted `_run_inference()` and `_attach_meta()` in `cortex/app/router.py`
- Eliminated ~200 lines of duplicated GPU error handling across 8 endpoints
- **Files**: `cortex/app/router.py`

---

## Phase 3 — Frontend Bundle & Component Optimization

> Goal: Cut bundle size, decompose bloated components.

### 3.1 Lazy-load tokenizer module
- **Root cause**: `WordCounterPage.tsx:12` statically imports `tokenCounter.ts` which pulls in `@huggingface/tokenizers` (2.99MB chunk)
- **Action**: Dynamic import — load tokenizer only when user selects a model that needs it
- **Files**: `frontend/src/pages/TextTools/WordCounterPage.tsx`, `frontend/src/lib/tokenCounter.ts`

### 3.2 Decompose PdfToolsPage — skipped
- Already well-structured: logic lives in `usePdfWorkspace` hook
- Component itself is mostly JSX composition, not worth splitting further

### 3.3 Decompose HubFilesPage ✅
- Extracted `useHubDialogs` hook + `HubDialogs` compound component + `BulkActionBar`
- Reduced from 530 → 448 lines
- **Files**: `HubFilesPage.tsx`, new `HubDialogs.tsx`

### 3.4 Image tool page shared hook ✅
- Created `useImageTool<T>()` hook extracting common state/logic
- Refactored ColorizePage, DenoisePage, RestoreFacePage to use it
- Full factory pattern deferred — pages have enough variation to warrant individual files

### 3.5 Consolidate imageApi FormData pattern — skipped
- Already well-factored with `createImageToolApi()` factory in place
- No further consolidation needed

### 3.6 Split route definitions by feature
- `routes/index.tsx` (196 lines) — single "big table" of all routes
- **Action**: Split into `routes/imageTools.ts`, `routes/dashboard.ts`, `routes/pdfTools.ts` etc.
- **Files**: `frontend/src/routes/index.tsx`

### 3.7 Fix frontend test i18n warning
- `i18next was not initialized` warning in test environment
- **Action**: Add proper i18n mock/init in test setup
- **Files**: `frontend/src/test/setup.ts` or vitest config

---

## Phase 4 — Cortex Service Decomposition

> Goal: Split control/data/monitoring planes in cortex.

### 4.1 Split router.py
- Currently handles: request models, concurrency control, dedup, stats, error mapping, all /v1/* endpoints
- **Action**: Split into:
  - `routes/` — endpoint definitions only
  - `middleware/concurrency.py` — semaphore, dedup, queue management
  - `middleware/stats.py` — request counting, timing
- **Files**: `cortex/app/router.py` (884 lines)

### 4.2 Split model_manager.py
- Currently handles: registration, loading, eviction, circuit breaking, profiling, state persistence
- **Action**: Split into:
  - `model_registry.py` — registration, discovery
  - `model_loader.py` — loading, unloading, VRAM management
  - `model_health.py` — circuit breaker, health checks
- **Files**: `cortex/app/model_manager.py` (885 lines)

### 4.3 Fix _request_key comment/implementation mismatch
- Comment says "avoid copy" but `image_b64.encode()` copies the string
- **Action**: Fix implementation or update comment to reflect reality
- **Files**: `cortex/app/router.py:204-218`

---

## Phase 5 — Polish & Consistency

> Goal: Clean up remaining inconsistencies.

### 5.1 Unify CSP configuration
- Three separate CSP definitions: `security_headers.py`, `nginx.conf`, `security-headers.conf`
- **Action**: Single source of truth, others reference it

### 5.2 Extract magic numbers to constants -- partially done
- Added 10 configurable settings to `core/config.py`:
  - Cortex circuit breaker: `cortex_cb_threshold`, `cortex_cb_cooldown`
  - Cortex HTTP timeouts: `cortex_timeout_connect/read/write`, `cortex_retry_delay`
  - IP ban: `ip_ban_threshold`, `ip_ban_window`, `ip_ban_duration`
  - Download URL TTL: `download_url_ttl`
- Updated consumers: `cortex_client.py`, `rate_limiter.py`, `file_service.py`, `file_result_builder.py`
- Remaining: `THUMB_MAX_SIZE`, `_MAX_SHARE_IMAGE_PX`, photo validation limits

### 5.3 Standardize datetime handling
- Mix of manual `tzinfo is None` checks and `_as_utc()` helpers
- **Action**: Enforce timezone-aware at model level via custom SQLAlchemy type

### 5.4 Frontend hardcoded colors
- Canvas colors in useShareCard.ts, inline hex in RemoveBgPage.tsx
- **Action**: Extract to theme constants

### 5.5 QueryClient cache strategy
- staleTime varies inconsistently (5s/10s/15s across hooks)
- **Action**: Set global defaults + per-query-type overrides in queryClient.ts

---

## Additional Items (not in original plan) ✅

### DI inject session into tool_recording.py / audit_log.py
- Added overridable `session_factory` module-level callable
- Replaced direct `_db.SessionLocal()` calls with `session_factory()`
- **Files**: `backend/app/core/tool_recording.py`, `audit_log.py`

### Add AbortController to useFileUpload hook
- `run()` now aborts previous in-flight request before starting new one
- Cleanup on unmount via `useEffect`
- Returns `abort()` callback for external cancellation
- **Files**: `frontend/src/hooks/useFileUpload.ts`

### Split AdminSystemPage
- Extracted `CortexStatusCard` (755 lines), `CortexModelsList` (490 lines), `CortexTimeline` (90 lines)
- AdminSystemPage reduced from 1381 → 180 lines
- **Files**: `frontend/src/pages/Admin/AdminSystemPage.tsx`, `CortexStatusCard.tsx`, `CortexModelsList.tsx`, `CortexTimeline.tsx`

---

## Execution Notes

- Each phase is independently shippable
- Phase 1 is prerequisite — must be green before other refactors
- Phase 2 and 3 can run in parallel (backend vs frontend)
- Phase 4 can be deferred if cortex is stable
- Phase 5 is opportunistic cleanup
