# File Hub (文件中心)（还需要文件预览图，重新设计文件管理页面）

Status: draft | Updated: 2026-03-06

Unified file storage and management. All files across the platform (user uploads, tool results, result share images) use a single storage layer. Replaces the separate "File Transfer", "File Locker", and fragmented storage directories.

---

## Motivation

Three separate storage systems (`data/files/`, `data/transfers/`, `data/result_shares/`) doing the same thing: store files, track metadata, clean up on expiry. Unifying them gives:

- One storage directory, one DB table, one cleanup job
- One place for users to manage all their files (uploads + tool results)
- Global quota across all files (all user-owned files count, no exceptions)
- Batch sharing: select multiple files, generate one link
- Tool results automatically appear in logged-in user's file list

---

## Scope

File Hub is responsible for:

- **Storage**: single `data/hub/` directory for all files on the platform
- **Lifecycle**: DB-driven expiration and cleanup for all files
- **User file management**: list, rename, extend, delete user-owned files
- **File sharing**: share groups with token + extract code for file download
- **Quota**: global per-user storage limits across all file sources

File Hub is NOT responsible for:

- **Result Share rendering**: structured JSON + OG tags + rendered share pages remain in `ResultShareService`. It stores its image files via the hub storage layer, but its business logic is independent.
- **Tool processing**: tool routers handle upload, processing, and call `HubService.save_tool_result()` to persist results
- **Credit gating**: `/api/download/{file_id}/unlock` remains in download router

---

## Core Concepts

**File** — Any file stored in the platform. Has an owner (nullable for anonymous), expiration, and source type. Can exist without being shared.

**Share Group** — A shareable link that bundles one or more files for download. Has a token, optional extract code, optional message.

**Quick Share** (formerly "File Transfer") — A shortcut flow: upload files + create share group in one step.

### ID naming conventions

Two distinct file identifiers exist in the system:

- **`id`** (`user_files.id`) — Database primary key. Used in all user-facing APIs (`/api/hub/files/{id}`, share group `file_ids`, tool result responses).
- **`file_id`** (`user_files.file_id`) — FileService storage UUID (32-char hex). Used internally for physical file access and in the legacy signed download endpoint (`/api/download/{file_id}`).

Frontend never sees or uses `file_id`. All API request/response fields referring to files use `id`.

---

## Unified Storage Layer

### Single storage directory

All files stored in `data/hub/` with config `hub_storage_dir` / `HUB_STORAGE_DIR`.

Replaces:
- `data/files/` (`FILE_STORAGE_DIR`) — tool processing results
- `data/transfers/` (`TRANSFER_STORAGE_DIR`) — transfer uploads
- `data/result_shares/` (`RESULT_SHARE_STORAGE_DIR`) — result share images

`FileService` is simplified to a pure bytes store (save/get/delete, UUID bucketing). `.json` sidecar files are removed — all metadata lives in `user_files` table. All callers use the same directory:

```python
FileService(storage_dir=settings.hub_storage_dir)
```

### Single DB table for all files

All files get a `user_files` record. No more mtime-based cleanup — everything is DB-driven via `expires_at`.

| Source | user_id | Default retention | Counts toward quota |
|--------|---------|-------------------|---------------------|
| User upload | user.id | 3 days | Yes |
| Tool result (logged-in) | user.id | 24h | Yes |
| Tool result (anonymous) | NULL | 1h | No (no owner) |
| Result share image | user.id or NULL | 24h | Yes (if owned) |

All user-owned files count toward quota equally, regardless of source.

---

## Database Models

### `user_files`

```
user_files
├── id                  PK
├── user_id             FK -> users.id, NULLABLE (indexed)
├── file_id             VARCHAR(32), FileService storage ID
├── original_filename   VARCHAR(255)
├── size                INTEGER, bytes
├── content_type        VARCHAR(128)
├── source              VARCHAR(20): upload / tool_result / result_share
├── expires_at          DATETIME(tz), indexed
├── status              VARCHAR(20), active / expired / deleted
├── created_at          DATETIME(tz)
└── updated_at          DATETIME(tz)
```

### `share_groups`

```
share_groups
├── id                  PK
├── user_id             FK -> users.id (indexed)
├── token               VARCHAR(16), unique, indexed
├── extract_code        VARCHAR(6), nullable, server-generated
├── message             TEXT, nullable (max 500 chars)
├── download_count      INTEGER, default 0
├── failed_code_attempts INTEGER, default 0
├── expires_at          DATETIME(tz), indexed
├── status              VARCHAR(20), active / expired / deleted
├── created_at          DATETIME(tz)
└── updated_at          DATETIME(tz)
```

`expires_at` is a denormalized field set to `MIN(user_files.expires_at)` of all linked files at creation time. Updated when a linked file is deleted, expired, or extended. Avoids JOIN on every list/cleanup query.

### `share_group_files` (join table)

```
share_group_files
├── id                  PK
├── share_group_id      FK -> share_groups.id (indexed)
└── user_file_id        FK -> user_files.id (indexed)

UNIQUE(share_group_id, user_file_id)
```

A file can belong to multiple share groups. A share group can contain multiple files.

---

## Storage Quotas

All user-owned files (`user_id IS NOT NULL AND status = 'active'`) count toward quota, including tool results.

| Limit | Default | Config |
|-------|---------|--------|
| Per-file size | 100 MB | `max_hub_file_mb` / `MAX_HUB_FILE_MB` |
| Total storage per user | 500 MB | `max_hub_total_mb` / `MAX_HUB_TOTAL_MB` |
| Max file count | 50 | `max_hub_files` / `MAX_HUB_FILES` |
| Max files per share group | 20 | `max_hub_share_files` / `MAX_HUB_SHARE_FILES` |

Quota query: `SELECT COALESCE(SUM(size), 0) FROM user_files WHERE user_id=? AND status='active'`

Concurrency: quota check uses `SELECT ... FOR UPDATE` on a per-user basis to prevent concurrent uploads from exceeding limits.

---

## Retention

| File type | Default | Max | Extendable |
|-----------|---------|-----|------------|
| User upload | 3 days | 7 days | Yes |
| Tool result (logged-in) | 24h | 7 days | Yes |
| Tool result (anonymous) | 1h | 1h | No |
| Result share image | 24h | 24h | No |

All retention periods are free in v1.

---

## Integration with Tool Processing

When a tool (image/PDF/video) finishes processing:

```python
# In tool router, after processing
hub = HubService(db)
user_file = await hub.save_tool_result(
    user_id=user.id if user else None,
    data=result_bytes,
    filename=output_filename,
    content_type=output_content_type,
)
# user_file.id is returned to frontend for sharing / management
```

- Logged-in users: file appears in "My Files" with `source = 'tool_result'`. Tool API response includes `user_file_id` so frontend can create share groups directly.
- Anonymous users: `user_id = NULL`, download via signed URL (same as current behavior), file expires in 1h.

### Signed download URL

The existing `/api/download/{file_id}` endpoint (with signature verification) is retained for:
- Anonymous tool result downloads
- Credit-gated file unlocking (`/api/download/{file_id}/unlock`)

This endpoint switches to `FileService(storage_dir=settings.hub_storage_dir)`.

### Result Share integration

`ResultShareService` stores its image files via `FileService` with the same `hub_storage_dir`. The `result_shares` table references `file_id` (the FileService UUID), not `user_files.id`. Result share images get their own `user_files` records for unified lifecycle management.

---

## API Endpoints

All under `/api/hub`.

### Upload Files (auth required)

```
POST /api/hub/upload
Content-Type: multipart/form-data

Form fields:
  files: UploadFile[] (1 or more, required)
  retention_days: int (1-7, default 3)

Response 200:
{
  "files": [
    {
      "id": 1,
      "file_name": "report.pdf",
      "size": 1048576,
      "content_type": "application/pdf",
      "source": "upload",
      "expires_at": "2026-03-09T12:00:00Z",
      "created_at": "2026-03-06T12:00:00Z"
    }
  ]
}

Errors:
  400: No files / too many files
  413: File too large / quota exceeded
  429: Rate limited
```

### List My Files (auth required)

```
GET /api/hub/files?page=1&page_size=20&source=upload

Response 200:
{
  "items": [
    {
      "id": 1,
      "file_name": "report.pdf",
      "size": 1048576,
      "content_type": "application/pdf",
      "source": "upload",
      "expires_at": "2026-03-09T12:00:00Z",
      "created_at": "2026-03-06T12:00:00Z",
      "share_count": 2
    }
  ],
  "total": 5,
  "used_bytes": 5242880,
  "quota_bytes": 524288000
}
```

`source` filter is optional. `share_count`: number of active share groups this file belongs to.

### Download Own File (auth required)

```
GET /api/hub/files/{id}/download

Response: File stream with Content-Disposition
Errors:
  404: Not found or not owned by user
```

### Rename File (auth required)

```
PATCH /api/hub/files/{id}
Body:
{
  "file_name": "quarterly-report.pdf"
}

Response 200:
{
  "id": 1,
  "file_name": "quarterly-report.pdf"
}

Errors:
  400: Invalid filename (validation reuses transfer_validation.py rules)
  404: Not found or not owned by user
```

### Extend File Retention (auth required)

```
POST /api/hub/files/{id}/extend
Body:
{
  "days": 3
}

Response 200:
{
  "id": 1,
  "expires_at": "2026-03-12T12:00:00Z"
}

Errors:
  400: Would exceed 7-day max from now
  404: Not found or not owned by user
```

### Delete Files (auth required)

```
DELETE /api/hub/files
Body:
{
  "ids": [1, 2, 3]
}

Response 200:
{
  "deleted": 3
}

Errors:
  400: Empty ids or too many (max 50)
```

Deletes physical files, removes from all share groups. If a share group becomes empty, it is also deleted. Only deletes files owned by the requesting user; non-owned IDs silently skipped.

### Create Share Group (auth required)

```
POST /api/hub/shares
Body:
{
  "file_ids": [1, 2, 3],
  "use_extract_code": false,
  "message": "Here are the files you requested"
}

Response 200:
{
  "id": 10,
  "token": "Ab3kX9mZ",
  "share_url": "/t/Ab3kX9mZ",
  "extract_code": null,
  "message": "Here are the files you requested",
  "file_count": 3,
  "total_size": 3145728,
  "expires_at": "2026-03-09T12:00:00Z",
  "created_at": "2026-03-06T12:00:00Z"
}

Errors:
  400: Empty file_ids / files not found / files not owned by user
  429: Rate limited
```

`expires_at` = earliest `expires_at` among the selected files.
`extract_code` always server-generated when `use_extract_code` is true.

### List My Share Groups (auth required)

```
GET /api/hub/shares?page=1&page_size=20

Response 200:
{
  "items": [
    {
      "id": 10,
      "token": "Ab3kX9mZ",
      "extract_code": "a3b9k2",
      "message": "Here are the files",
      "file_count": 3,
      "total_size": 3145728,
      "download_count": 5,
      "expires_at": "2026-03-09T12:00:00Z",
      "created_at": "2026-03-06T12:00:00Z",
      "status": "active"
    }
  ],
  "total": 2
}
```

### Delete Share Group (auth required)

```
DELETE /api/hub/shares/{share_id}

Response 200: {"ok": true}
```

Only deletes the share group (link becomes invalid). Files remain in user's storage.

### Quick Share (auth required)

```
POST /api/hub/quick-share
Content-Type: multipart/form-data

Form fields:
  files: UploadFile[] (required)
  retention_days: int (1-7, default 3)
  use_extract_code: bool (default false)
  message: str (optional, max 500)

Response 200:
{
  "files": [ ... ],
  "share": {
    "id": 10,
    "token": "Ab3kX9mZ",
    "share_url": "/t/Ab3kX9mZ",
    "extract_code": null,
    "expires_at": "2026-03-09T12:00:00Z"
  }
}

Errors:
  400/413/429: Same as upload
```

Equivalent to upload + create share group in one request. This is what the "Quick Share" page uses.

### Share Group Info (public, no auth)

```
GET /api/hub/s/{token}/info?code=a3b9k2

Response 200 (code verified or no code needed):
{
  "token": "Ab3kX9mZ",
  "message": "Here are the files",
  "file_count": 3,
  "total_size": 3145728,
  "expires_at": "2026-03-09T12:00:00Z",
  "has_extract_code": true,
  "status": "active",
  "created_at": "2026-03-06T12:00:00Z",
  "files": [
    {
      "id": 1,
      "file_name": "report.pdf",
      "size": 1048576,
      "content_type": "application/pdf"
    }
  ]
}

Response 200 (code required but not provided):
{
  "has_extract_code": true,
  "need_code": true
}

Errors:
  404: Invalid token or all files expired/deleted
  423: Locked (too many failed attempts)
```

File list and message are only revealed after extract code verification (same as current transfer behavior).

### Share File Download (public, no auth)

```
GET /api/hub/s/{token}/{file_id}/download?code=a3b9k2

Response: File stream
Errors:
  404: Token invalid or file not in group
  403: Extract code required or incorrect
  423: Locked
```

### Share Zip Download (public, no auth)

```
GET /api/hub/s/{token}/download-zip?code=a3b9k2

Response: Zip file stream
Errors:
  404/403/423: Same as above
```

---

## Frontend

### File Hub Page (`/hub`, auth required)

Main file management page with two tabs or sections:

**My Files tab:**
- Upload area (drag & drop, multi-file)
- Retention input (1-7 days, default 3)
- File list: checkbox select, filename, size, source badge (upload/tool_result), expiry countdown, share count, actions
- Actions per file: Download, Rename, Extend
- Batch actions toolbar: Share selected, Delete selected
- Storage usage bar: "128 MB / 500 MB"
- Upload/download progress: use universal `TransferProgress` component

**My Shares tab:**
- List of share groups: token, file count, total size, download count, expiry, status
- Actions per share: Copy link, View details, Delete
- Share detail: expand to show file list, message, extract code

### Quick Share Page (`/transfer`)

Streamlined upload-and-share flow (replaces current Transfer create page, keeps same URL):
- Upload files
- Set retention, optional extract code, optional message
- One click: upload + share
- Result: share link + extract code + copy button + Web Share API

### Share Receive Page (`/t/{token}`)

Public page (same URL as current transfer receive, no breakage):
- Step 1: If extract code required, show input field
- Step 2: Show file list (name, size), message, download buttons per file, download-all-as-zip button
- Download progress: use universal `TransferProgress` component
- Expired/deleted: show status message

### Tool Result Pages

Tool result pages gain a "Share" action that creates a share group from the tool result's `user_file_id` (logged-in users only). Replaces the old "create-from-result" transfer flow.

### Navigation

Replace "File Transfer" with "File Hub" in sidebar. "Quick Share" can be a sub-entry or a prominent action button within the hub page.

### Admin

Replace `AdminTransfersPage` with a unified File Hub admin page showing all `user_files` and `share_groups`. Remove transfer-specific admin code.

---

## URL Routing Summary

| URL | Layer | Purpose | Auth |
|-----|-------|---------|------|
| `/hub` | Frontend | File Hub management page | Required |
| `/transfer` | Frontend | Quick Share (upload + share) | Required |
| `/t/{token}` | Frontend | Share receive page (download) | Public |
| `/r/{token}` | Frontend | Result Share page (unchanged) | Public |
| `/s/{token}` | Backend | Result Share OG page (unchanged) | Public |
| `/api/hub/*` | Backend | File Hub API endpoints | Varies |

Frontend routes `/t/{token}` call backend API `/api/hub/s/{token}/*` for data. No URL conflicts. `/t/` for file sharing, `/r/` for result sharing, `/s/` for OG meta tags.

---

## Expiration & Cleanup

Single background job `expire_hub_files()`, replaces both `expire_transfers()` and `cleanup_expired_files()`:

1. Scan `user_files` where `expires_at < now()` and `status = 'active'`
2. Set `status = 'expired'`, delete physical file via `FileService`
3. For each expired file, remove from `share_group_files`
4. Any `share_groups` with zero remaining files: set `status = 'expired'`

One job handles everything: user uploads, tool results, anonymous files, result share images.

---

## File Validation

Reuse existing `transfer_validation.py` rules for user uploads (block executables, scripts, dangerous MIME types). Tool results bypass validation (generated by the system).

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| Upload / Quick Share | 10/min |
| List files | 30/min |
| List shares | 30/min |
| Download (owner) | 30/min |
| Download (share) | 30/min |
| Download zip (share) | 10/min |
| Create share group | 10/min |
| Rename / Extend | 10/min |
| Delete files / shares | 10/min |

---

## Migration

Direct replacement, no transition period:

1. Drop `file_transfers` + `transfer_files` tables
2. Remove old code: `models/file_transfer.py`, `services/transfer_service.py`, `routers/transfer.py`, `schemas/transfer.py`, frontend `pages/Transfer/`, `AdminTransfersPage`
3. Remove `burn_after_read` and `max_downloads` from the codebase entirely (including admin schemas, alembic migration)
4. Consolidate storage directories: remove `FILE_STORAGE_DIR`, `TRANSFER_STORAGE_DIR`, `RESULT_SHARE_STORAGE_DIR` configs; replace with single `HUB_STORAGE_DIR`
5. Remove `FileService.cleanup_expired_files()` (mtime-based cleanup no longer needed)
6. Remove `upload-from-result` API (tool results are already in `user_files`, frontend creates share groups directly)
7. Update `/api/download/{file_id}` router to use `hub_storage_dir`
8. Update all tool routers to call `HubService.save_tool_result()` and return `user_file_id` in response
9. Update `ResultShareService` to use `hub_storage_dir`
10. Build new File Hub system (new tables, service, router, frontend)

11. Remove `.json` sidecar from `FileService` — metadata is fully covered by `user_files` table. `FileService` becomes a pure bytes store (save/get/delete by UUID). Update `/api/download/` to read content_type/filename from `user_files` table instead of sidecar.
