# File Locker (文件寄存)

Status: outdated | Updated: 2026-03-06

> Superseded by [file-hub.md](file-hub.md) — File Transfer and File Locker unified into File Hub.

Logged-in users can temporarily store files for cross-device access. Files auto-expire and are destroyed.

---

## Core Design

Independent `file_locker` table with `FileService` for storage. Sharing is a toggle on the file itself (not a separate entity).

---

## Database Model

```
file_locker
├── id                  PK
├── user_id             FK -> users.id (indexed)
├── file_id             VARCHAR(32), FileService storage ID
├── original_filename   VARCHAR(255)
├── size                INTEGER, bytes
├── content_type        VARCHAR(128)
├── expires_at          DATETIME(tz), indexed
├── status              VARCHAR(20), active / expired / deleted
├── share_token         VARCHAR(16), nullable, unique, indexed
│                       non-null = sharing enabled, null = sharing disabled
├── share_extract_code  VARCHAR(4), nullable, server-generated 4-digit code
├── failed_code_attempts INTEGER, default 0, brute-force protection
├── created_at          DATETIME(tz)
└── updated_at          DATETIME(tz)
```

- File lifecycle is the single source of truth. Share link validity = file validity.
- Toggle sharing on: generate `share_token` (8-char alphanumeric).
- Toggle sharing off: set `share_token = NULL`, `share_extract_code = NULL`.
- `share_extract_code`: always server-generated random 4-digit code, user only controls on/off.
- `failed_code_attempts`: lock share download after 10 consecutive failures (same pattern as file transfer).

---

## Storage Quotas

| Limit | Default | Config |
|-------|---------|--------|
| Per-file size | 100 MB | `max_locker_file_mb` / `MAX_LOCKER_FILE_MB` |
| Total storage per user | 500 MB | `max_locker_total_mb` / `MAX_LOCKER_TOTAL_MB` |
| Max file count | 50 | `max_locker_files` / `MAX_LOCKER_FILES` |

Quota query: `SELECT COALESCE(SUM(size), 0) FROM file_locker WHERE user_id=? AND status='active'`

---

## Retention

Default: 3 days. Max: 7 days. Users can extend retention before expiry (up to max 7 days from current time).

All retention periods are free in v1. Credit-based extended retention/capacity reserved for future.

---

## API Endpoints

All under `/api/locker`.

### Upload File (auth required)

```
POST /api/locker/upload
Content-Type: multipart/form-data

Form fields:
  file: UploadFile (required)
  retention_days: int (1-7, default 3)

Response 200:
{
  "id": 123,
  "file_name": "report.pdf",
  "size": 1048576,
  "content_type": "application/pdf",
  "expires_at": "2026-03-09T12:00:00Z",
  "created_at": "2026-03-06T12:00:00Z",
  "share_enabled": false,
  "share_token": null,
  "share_extract_code": null
}

Errors:
  413: File too large / quota exceeded
  429: Rate limited
```

### List My Files (auth required)

```
GET /api/locker/list?page=1&page_size=20

Response 200:
{
  "items": [
    {
      "id": 123,
      "file_name": "report.pdf",
      "size": 1048576,
      "content_type": "application/pdf",
      "expires_at": "2026-03-09T12:00:00Z",
      "created_at": "2026-03-06T12:00:00Z",
      "share_enabled": true,
      "share_token": "Ab3kX9mZ",
      "share_extract_code": "3829"
    }
  ],
  "total": 5,
  "used_bytes": 5242880,
  "quota_bytes": 524288000
}
```

### Download Own File (auth required)

```
GET /api/locker/download/{locker_id}

Response: File stream with Content-Disposition
Errors:
  404: Not found or not owned by user
```

### Rename File (auth required)

```
PATCH /api/locker/{locker_id}
Body:
{
  "file_name": "quarterly-report.pdf"
}

Response 200:
{
  "id": 123,
  "file_name": "quarterly-report.pdf"
}

Errors:
  400: Invalid filename
  404: Not found or not owned by user
```

Filename validation reuses `transfer_validation.py` rules (length, blocked extensions, dangerous patterns).

### Extend Retention (auth required)

```
POST /api/locker/{locker_id}/extend
Body:
{
  "days": 3
}

Response 200:
{
  "id": 123,
  "expires_at": "2026-03-12T12:00:00Z"
}

Errors:
  400: Would exceed 7-day max from now
  404: Not found or not owned by user
```

New `expires_at` = now + days. Cannot exceed 7 days from current time.

### Delete File (auth required)

```
DELETE /api/locker/{locker_id}

Response 200: {"ok": true}
```

### Batch Delete (auth required)

```
DELETE /api/locker/batch
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

Only deletes files owned by the requesting user. Non-existent or non-owned IDs are silently skipped.

### Toggle Sharing (auth required)

```
POST /api/locker/{locker_id}/share
Body:
{
  "enabled": true,
  "extract_code": true   // optional, default false
}

Response 200:
{
  "share_enabled": true,
  "share_token": "Ab3kX9mZ",
  "share_extract_code": "3829",
  "share_url": "/s/Ab3kX9mZ"
}
```

```
POST /api/locker/{locker_id}/share
Body:
{
  "enabled": false
}

Response 200:
{
  "share_enabled": false,
  "share_token": null,
  "share_extract_code": null,
  "share_url": null
}
```

### Share File Info (public, no auth)

```
GET /api/locker/s/{share_token}/info?code=3829

Response 200:
{
  "file_name": "report.pdf",
  "size": 1048576,
  "content_type": "application/pdf",
  "need_code": false
}

If extract code is set and not provided / incorrect:
Response 200:
{
  "need_code": true
}

Errors:
  404: Invalid token or file expired/deleted
  423: Locked (too many failed attempts)
```

### Share File Download (public, no auth)

```
GET /api/locker/s/{share_token}/download?code=3829

Response: File stream
Errors:
  404: Invalid token or file expired/deleted
  403: Extract code required or incorrect
  423: Locked (too many failed attempts)
```

---

## Frontend

### Locker Page (`/locker`, auth required)

Dedicated page for file locker management.

- Upload area (drag & drop or click, single file per upload)
- Upload/download progress: use universal progress component (shared across all file transfer scenarios)
- Retention input (1-7 days, default 3)
- File list: filename, size, expiry countdown, share status, actions
- Actions per file: Download, Rename, Extend, Share toggle, Delete
- Batch selection + batch delete
- Storage usage bar: "128 MB / 500 MB"
- Share toggle opens popover: on/off switch, optional extract code checkbox
- When share is enabled: show link + extract code + copy button + Web Share API button (if `navigator.share` available)

### Share Download Page (`/s/{token}`)

- Step 1: If extract code required, show input field first
- Step 2: Show file info (filename, size), download button
- Download progress: use universal progress component
- File expired/deleted: show status message

### Navigation

Add "File Locker" entry to sidebar/nav, alongside "File Transfer".

---

## Expiration & Cleanup

New background job `expire_locker_files()`, same pattern as `expire_transfers()`:
- Scan `file_locker` where `expires_at < now()` and `status = 'active'`
- Set `status = 'expired'`, delete physical file via `FileService`
- Run on same schedule as transfer cleanup

---

## File Validation

Reuse existing `transfer_validation.py` rules (block executables, scripts, dangerous MIME types).

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| Upload | 10/min |
| List | 30/min |
| Download (owner) | 30/min |
| Download (share) | 30/min |
| Toggle share | 10/min |
| Rename | 10/min |
| Extend | 10/min |
| Batch delete | 10/min |
