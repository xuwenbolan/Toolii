# Markdown Online Editor

Status: draft | Updated: 2026-03-09

Online Markdown editing and preview, built on top of [File Hub](file-hub.md). Users can create, edit, and preview `.md` files directly in the browser using a WYSIWYG editor (Milkdown). Shared `.md` files render as formatted preview pages instead of raw downloads.

---

## Scope

**In scope:**
- Create new `.md` documents (saved as Hub files)
- Edit existing `.md` files in a WYSIWYG Markdown editor
- Preview `.md` files (read-only rendered view)
- Shared `.md` files default to online preview with download button
- Auto-save (debounce 60s) + manual save (Ctrl+S) + unsaved-changes guard on leave
- Export as `.md` file and PDF

**Out of scope:**
- Real-time collaboration / multi-user editing
- Version history / diff
- Editing non-`.md` files (`.txt`, etc.)

---

## Architecture

### Storage

Documents are regular Hub files with `content_type = "text/markdown"` when created by the editor. No separate database table. All Hub features (quota, expiration, rename, delete, share) apply automatically.

Existing uploaded files are still eligible for Markdown editing if:
- `original_filename` ends with `.md` (case-insensitive)
- Content decodes as UTF-8 text

`content_type` is helpful metadata, but **editing eligibility is determined by filename extension + successful UTF-8 decode**, not MIME alone.

### Content size limit

Markdown content is capped at **1 MB** per saved file. Enforced at backend content endpoints and frontend.

Important edge case: an existing uploaded `.md` file may already be larger than 1 MB, because general Hub upload limits are higher. In that case:
- The file is still readable in the editor if it decodes as UTF-8
- The editor shows an oversize warning immediately
- Save is disabled until the current content is reduced to <= 1 MB

### Content safety

Backend must validate that the file is genuinely text (decodable as UTF-8) on both read and write. This prevents:
- Renaming a binary file to `.md` and then hitting the content endpoint (would fail UTF-8 decode)
- Uploading a non-text file with `text/markdown` content type

On `GET /content`: if UTF-8 decode fails, return 422 with `"INVALID_CONTENT"` error.
On `PUT /content`: validate the incoming string re-encodes cleanly to UTF-8 (guaranteed by JSON, but enforce size limit on the encoded bytes).

### Render safety

Markdown preview is a rendering problem, separate from file decode safety.

For both the owner editor preview and the public share preview:
- Raw HTML must be disabled or sanitized before rendering
- Dangerous URLs such as `javascript:` must be stripped
- External images may render only from safe URL schemes (`http` / `https`)
- No script execution or arbitrary inline event handlers from Markdown content

### Editor Images

The editor supports image paste/upload. Images are stored as Hub files and served via a public (unauthenticated) endpoint. This allows the same image URL to work in both the owner's editor and shared preview pages.

#### Storage model

Images are regular `UserFile` records distinguished by:
- `source = "editor_image"` (new source value)
- `parent_file_id: int` — dedicated indexed column pointing to the `user_files.id` of the parent `.md` document (not stored in `meta` JSON — enables efficient queries for GC, lifecycle sync, and cascade delete)
- `status`: `"pending"` on upload, `"active"` after first save that references it

The `parent_file_id` link enables garbage collection and expiration sync. Images count against the user's normal Hub storage quota.

#### URL format

Images are referenced in markdown as:

```markdown
![alt text](/api/hub/images/<storage_file_id>)
```

The URL uses the 32-char hex UUID (`user_files.file_id`), not the integer database id. This UUID is cryptographically random and unguessable (128-bit entropy), providing security without authentication.

CSP: the image URL is same-origin, so the existing `img-src 'self'` directive covers it. No CSP changes needed.

#### Upload flow (frontend)

1. User pastes or drops an image in the editor
2. Crepe's `ImageBlock` calls the `onUpload(file)` callback
3. Frontend validates: file type is in whitelist (`image/png`, `image/jpeg`, `image/gif`, `image/webp`), size <= 5 MB
4. Frontend compresses the image if needed (see [Image compression](#image-compression))
5. `POST /api/hub/files/{docId}/images` with multipart file
6. Backend validates content type whitelist + magic bytes, checks quota, stores file, returns `{ file_id, url }`
7. Frontend returns the `url` string to Crepe, which inserts it into the document

If upload fails (quota exceeded, too large, network error), show a toast and return an empty string to Crepe (image insertion is cancelled).

#### Image compression

Before uploading, the frontend compresses large images to reduce storage and bandwidth:

- **Max dimension**: 1920px (covers most editor widths at 2x retina). Images within bounds are not resized.
- **Output format**: JPEG/WebP inputs -> WebP output (smaller file size); PNG stays PNG (preserve transparency)
- **GIF**: skipped entirely (preserve animation)
- **Small images** (< 200KB): skipped (compression overhead not worth it)
- **Quality**: 0.85 for lossy formats
- **Implementation**: `OffscreenCanvas` + `createImageBitmap` — no DOM manipulation needed

This runs client-side before the upload request. The 5 MB size limit applies to the original file (pre-compression validation), so users get a clear error for truly oversized files even if compression would have helped.

#### Image type security

Only the following image types are accepted (both frontend and backend enforce this):

| Type | Magic bytes |
|------|------------|
| `image/png` | `\x89PNG` |
| `image/jpeg` | `\xff\xd8\xff` |
| `image/gif` | `GIF87a` or `GIF89a` |
| `image/webp` | `RIFF....WEBP` |

**SVG is explicitly rejected** — `image/svg+xml` can contain JavaScript and poses XSS risk even with `X-Content-Type-Options: nosniff`.

Backend performs a **magic bytes check**: the first N bytes of the uploaded file must match the expected signature for the declared content type. This prevents uploading non-image files with a spoofed content type header.

#### Save-time concurrency

Frontend tracks the number of in-progress image uploads via a ref counter (`pendingUploadsRef`). When save is triggered (manual or auto):

- If uploads are pending, wait up to 10 seconds for them to complete
- If still pending after 10s, save anyway — GC will clean up uninserted images on the next save
- This prevents the race condition where save-time GC deletes an image that's still being uploaded

#### Save-time GC

Every successful `PUT /api/hub/files/{id}/content` triggers garbage collection:

1. Parse the saved markdown content for all `/api/hub/images/{file_id}` references (regex on the stored content)
2. Query all `UserFile` records where `parent_file_id = <this document id>` and `source = "editor_image"` and `status IN ("pending", "active")`
3. For each record:
   - If its `file_id` is in the reference set: set `status = "active"` (confirm)
   - If its `file_id` is **not** in the reference set: delete the file (FileService + set `status = "deleted"`)
4. Release freed quota immediately

This ensures **no orphan images survive past the next successful save**.

#### Pending image expiration

Images uploaded but never confirmed (user closes browser without saving) need a safety net:

- **If parent document has an `expires_at`**: the pending image inherits it, so the normal expiration job cleans it up
- **If parent document has unlimited retention** (`expires_at = NULL`): set pending images to expire in **24 hours** from upload time
  - If a save confirms the image within 24h, its status becomes `"active"` and `expires_at` is set to NULL (matching parent)
  - If no save confirms it, the expiration job deletes it

The existing `expire_files()` background task handles both cases — no new scheduled task needed.

#### Parent document lifecycle sync

When the parent document's expiration changes (via extend, or set to unlimited):
- Update `expires_at` on all `"active"` images with matching `parent_file_id` to match the new value
- This is done in the `extend_file` and save flows

When the parent document is deleted:
- All images with matching `parent_file_id` are also deleted (query by indexed `parent_file_id` column, not FK cascade)

#### Limits

| Limit | Value | Config key |
|-------|-------|------------|
| Max image file size | 5 MB | `MAX_EDITOR_IMAGE_MB` |
| Allowed content types | `image/png`, `image/jpeg`, `image/gif`, `image/webp` | `ALLOWED_IMAGE_TYPES` |
| Frontend compression | Max 1920px, quality 0.85 | Hardcoded |
| Rate limit (upload) | 20/minute | Per-user |
| Rate limit (serve) | 200/minute | Per-IP |

### Backend

Six endpoints are required for the editor flow. The existing rename endpoint (`PATCH /api/hub/files/{id}`) is reused, but with extra `.md` filename rules.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/hub/files/{id}` | User (owner) | Read single-file metadata for editor bootstrapping |
| `GET` | `/api/hub/files/{id}/content` | User (owner) | Read file content as JSON `{ content: string, updated_at: string }` |
| `PUT` | `/api/hub/files/{id}/content` | User (owner) | Save content + image GC, returns `{ size: int, updated_at: string }` |
| `POST` | `/api/hub/files/{id}/images` | User (owner) | Upload image for document, returns `{ file_id: string, url: string }` |
| `GET` | `/api/hub/images/{file_id}` | **None** (public) | Serve editor image by storage file_id (UUID) |
| `GET` | `/api/hub/s/{token}/{file_id}/content` | Public (+ extract code) | Read shared file content for preview |

#### `GET /api/hub/files/{id}`

- Verify file belongs to user and is active
- Return metadata needed by the editor header and guards:
  - `id`
  - `file_name`
  - `size`
  - `content_type`
  - `expires_at`
  - `updated_at`
- Editor uses this endpoint before fetching content, so it can:
  - Verify `.md` eligibility
  - Display the correct file name immediately
  - Show oversize warning before first save attempt

#### `GET /api/hub/files/{id}/content`

- Verify file belongs to user, is active, and has `.md` extension in filename
- Read file bytes from FileService, decode as UTF-8
- If decode fails, return 422 `INVALID_CONTENT`
- Return `{ "content": "...", "updated_at": "..." }`

#### `PUT /api/hub/files/{id}/content`

- Rate limit: **30/minute** (higher than default to accommodate auto-save + manual Ctrl+S)
- Verify file belongs to user, is active, and has `.md` extension in filename
- Accept JSON body `{ "content": "...", "base_updated_at": "..." }`
- Encode to UTF-8, validate size <= 1 MB
- If `new_size > old_size`, enforce Hub quota using the byte delta (`new_size - old_size`)
- If `base_updated_at` is older than the current DB value, return 409 `CONTENT_CONFLICT`
- Write new bytes to FileService (overwrite existing file_id)
- Update `user_files.size` in database
- **Image GC** (see [Editor Images > Save-time GC](#save-time-gc)): after writing content, scan for image references and delete unreferenced images belonging to this document
- Return `{ "size": <new_byte_size>, "updated_at": "..." }`

#### `POST /api/hub/files/{id}/images`

- Rate limit: **20/minute**
- Verify document file belongs to user, is active, and has `.md` extension
- Accept multipart `file` field (single image)
- Validate:
  - Content type in `ALLOWED_IMAGE_TYPES` whitelist (png, jpeg, gif, webp — SVG rejected)
  - Magic bytes match declared content type (file header check)
  - File size <= **5 MB** (`MAX_EDITOR_IMAGE_MB`)
  - Enforce Hub quota (same as regular upload)
- Store via `FileService.save_bytes()`
- Create `UserFile` record with:
  - `original_filename`: sanitized original filename
  - `content_type`: from upload
  - `source`: `"editor_image"`
  - `parent_file_id`: `<document user_file.id>`
  - `expires_at`: same as parent document's `expires_at`
  - `status`: `"pending"`
- Return `{ "file_id": "<storage_file_id>", "url": "/api/hub/images/<storage_file_id>" }`

Note: the `url` uses the **storage file_id** (32-char UUID), not the database id. This is the same identifier used by `FileService.get_path()`.

#### `GET /api/hub/images/{file_id}`

- **No authentication required.** Security relies on the 128-bit UUID being unguessable.
- Rate limit: **200/minute** (per IP — high enough for pages with many images + refreshes)
- `file_id` is the 32-char hex storage UUID
- Look up `UserFile` by `file_id` column where `source = "editor_image"` and `status IN ("pending", "active")`
- If not found or file expired, return 404
- Serve the file with appropriate `Content-Type`, `Cache-Control: public, max-age=86400`, and `X-Content-Type-Options: nosniff`
- Must **not** serve non-image files even if somehow stored with this source — validate `content_type` is in `ALLOWED_IMAGE_TYPES` before serving

#### `GET /api/hub/s/{token}/{file_id}/content`

- Same auth logic as existing share download (token + optional extract code)
- Reuse the existing share-group extract code contract (current 6-char server-generated code)
- Verify file has `.md` extension
- Read and decode as UTF-8, return `{ "content": "..." }`

**Note on markdown detection:** Use filename extension (`.md`) rather than `content_type` field. This is more reliable. Users may upload files with correct extension but wrong MIME type, or vice versa. The `.md` extension is the user-visible contract: "this file is editable as Markdown."

**Rename rules for Markdown files:**
- Markdown detection is `original_filename.lower().endswith(".md")`
- A file currently treated as Markdown must keep a `.md` suffix when renamed
- If rename is triggered from the editor and the user omits the suffix, backend may auto-append `.md`
- Renaming a Markdown file to a non-`.md` filename returns 400 `INVALID_MARKDOWN_FILENAME`

### FileService change

Add an `overwrite_bytes` method to `FileService`:

```python
def overwrite_bytes(self, file_id: str, data: bytes) -> int:
    """Overwrite an existing file's content. Returns new size."""
    path = self._file_path(file_id)
    if not path.exists():
        raise FileNotFoundError(file_id)
    tmp = path.with_name(f"{path.name}.{uuid.uuid4().hex}.tmp")
    tmp.write_bytes(data)
    tmp.replace(path)
    return len(data)
```

In-place content update without changing `file_id`, so share links stay valid.
Implementation should prefer atomic replace semantics (temp file in same directory + rename) instead of direct partial writes.

---

## Frontend

### Dependencies

```
pnpm add @milkdown/crepe @milkdown/react
```

Milkdown Crepe v7: ProseMirror-based WYSIWYG Markdown editor with built-in slash menu, floating toolbar, block handle, and link tooltip. No separate toolbar component needed.

### Components

#### `TyporaEditor`

Location: `frontend/src/components/editor/TyporaEditor.tsx`

Props:
- `initialContent: string` — Markdown text to load
- `placeholder?: string` — Placeholder text for empty document
- `onChange: (markdown: string) => void` — Called on content change
- `onNormalized?: (markdown: string) => void` — Called once on init with normalized markdown (prevents false dirty state)
- `onImageUpload?: (file: File) => Promise<string>` — Called when user pastes/drops an image. Returns the image URL to insert, or empty string to cancel.

Uses Milkdown Crepe with all built-in features except `Latex`. Crepe provides slash menu (`/`), floating format toolbar (on text selection), block handles, and image block (paste/drop/URL) — no separate `EditorToolbar` component needed.

**ImageBlock configuration:**

```typescript
featureConfigs: {
  [CrepeFeature.ImageBlock]: {
    onUpload: async (file: File) => onImageUploadRef.current?.(file) ?? '',
  },
}
```

The `onUpload` callback is provided by the parent `DocEditorPage` and handles:
1. Client-side validation (type whitelist: png/jpeg/gif/webp, 5 MB limit)
2. Client-side compression (max 1920px, see [Image compression](#image-compression))
3. Upload tracking (`pendingUploadsRef++` / `--`)
4. `POST /api/hub/files/{docId}/images`
5. Return the URL string (`/api/hub/images/{file_id}`)
6. Error handling (toast on failure, return `''` to cancel insertion)

Mobile: editor is functional but not optimized; no mobile-specific restrictions for now.

**CSS imports:** All Crepe theme CSS files are imported per-component, including `image-block.css`. `latex.css` is skipped (Latex feature disabled).

#### `MilkdownPreview`

Location: `frontend/src/components/editor/MilkdownPreview.tsx`

Props:
- `content: string` — Markdown text to render
- `className?: string`

Uses Milkdown Crepe in readonly mode (`crepe.setReadonly(true)`) with `Placeholder`, `BlockEdit`, `Cursor`, `Toolbar`, and `Latex` features disabled. `ImageBlock` is enabled so images render identically to the editor. Used for:
- Share preview pages (replaces `react-markdown`)
- Print/PDF export (not used — see [Export as PDF](#export-as-pdf) for rationale)

#### `EditorOutline`

Location: `frontend/src/components/editor/EditorOutline.tsx`

Collapsible left sidebar (220px, desktop only by default) showing document headings as a table of contents:
- Extracts h1-h6 from markdown content
- Click scrolls editor to heading via `scrollIntoView`
- Highlights currently visible heading via IntersectionObserver
- State persisted in localStorage (`doc-outline-open`)
- Toggle via PanelLeft button in header

#### `EditorStatusBar`

Location: `frontend/src/components/editor/EditorStatusBar.tsx`

Fixed bottom bar (28px) showing:
- **Left:** save status with color-coded dot (green=saved, amber=unsaved/saving, red=error)
- **Center:** word count + character count (CJK-aware)
- **Right:** content size vs 1 MB limit, with warnings

### Pages

#### `DocEditorPage`

Location: `frontend/src/pages/Docs/DocEditorPage.tsx`
Route: `/doc/edit/:id`

Layout: **Full-screen standalone** — no DashboardLayout.

```
Header (h-11, sticky): [←] [Outline toggle] [filename ✏] ---- [Export .md] [Print] [Save] [⋮]
├── EditorOutline (left sidebar, 220px, collapsible, lg+ only)
└── TyporaEditor (flex-1)
@media print: hides header/sidebar/statusbar/editor-chrome, prints ProseMirror DOM directly
EditorStatusBar (fixed bottom, h-7): [status dot + label] --- [word count] [char count] [size/limit]
```

Desktop: Export .md and Print buttons shown as icon buttons. Mobile: collapsed into overflow menu.
Status information (save state, word count, size) lives entirely in the bottom status bar — not in the header.

Flow:
1. Fetch file metadata (`GET /api/hub/files/{id}`) to verify it exists and has `.md` extension
2. Fetch content (`GET /api/hub/files/{id}/content`)
3. Render `TyporaEditor` with content; show loading skeleton during fetch
4. Track dirty state (content changed since last successful save)
5. If initial file size is > 1 MB, show warning in status bar and disable save until content is reduced
6. Save triggers:
   - **Auto-save**: 300ms content sync debounce + 60s idle timer (~60.3s after last keystroke)
   - **Manual**: Ctrl+S (Cmd+S on Mac) or Save button — reads from `contentRef` for latest content
   - **On leave**: if dirty (checked via ref, not stale state), show save/discard dialog
7. On 409 `CONTENT_CONFLICT`, stop auto-save and show conflict dialog with reload guidance
8. On 429 (rate limited), suppress auto-save for 30 seconds then resume
9. Unsaved changes guard: `beforeunload` + React Router `useBlocker`

#### New document creation

"New Document" button in both **homepage tool grid** and `HubFilesPage` header:
- Generates filename with timestamp: `untitled-MMDDHHmm.md` (e.g. `untitled-03071430.md`)
- Creates a blank `.md` file via `POST /api/hub/upload` (empty content, timestamped filename, content type `text/markdown`)
- Navigates to `/doc/edit/:id`

No need to query existing files — timestamp ensures uniqueness.

### Homepage Integration

Add "Markdown Editor" as a tool entry on the homepage tool grid:
- Icon + title + brief description
- Click → navigate to `/dashboard/hub?tab=files`
- Requires login (redirect to auth if not logged in)

No dedicated `docs` tab is required in v1. The first landing area is the existing Files tab, with a visible "New Document" CTA.

### Hub Page Integration

In `HubFilesPage`:
- Add "New Document" button in the header area
- Keep existing row-selection behavior for batch actions

In `HubFilesPage`, for files with `.md` extension:
- Click file name → navigate to `/doc/edit/:id`
- Add "Edit" icon button in file row actions
- Entire row does **not** become "open editor" in v1, because row click already means select for bulk actions
- Non-`.md` files: click-to-download (existing behavior)

### Share Page Integration

In `TransferReceivePage` (`/t/{token}`):

**Single `.md` file:**
- Auto-fetch content via `GET /api/hub/s/{token}/{file_id}/content`
- File info card (metadata + download) stays inside `max-w-2xl` container
- Markdown preview renders **outside** the card container — `MilkdownPreview` (Crepe readonly mode) manages its own `max-width: 52rem` centering via ProseMirror CSS, matching the editor's reading width
- Preview header (title + print button) aligns with the card via its own `max-w-2xl` constraint
- Card section is `print:hidden` when preview is shown; only the rendered document prints

**Multiple files (with some `.md`):**
- Keep existing file list UI
- `.md` files get a "Preview" button → opens modal with `MilkdownPreview` readonly preview

**Extract code compatibility:**
- Reuse the existing share access flow
- Input and validation rules must match the current share-group extract code contract
- Locked share state follows the existing backend response (423), not a new editor-specific rule

**Fallback:** If content fetch fails (binary file renamed to `.md`, decode error), fall back to download-only with a note.

---

## Save Strategy

### Performance: debounced content sync

Milkdown fires `markdownUpdated` on every keystroke, which would trigger expensive per-render computations (byte length, word count, heading extraction, IntersectionObserver rebuild). To avoid this:

1. **`contentRef`** (ref) — always holds the latest markdown, updated synchronously on every keystroke. Used by `handleSave`, `beforeunload`, `useBlocker`, and `handleExportMd` for correctness.
2. **`content`** (state) — debounced mirror of `contentRef`, updated every **300ms** via `setTimeout`. Drives all rendering: `EditorStatusBar` (word count, byte size), `EditorOutline` (heading list), and the auto-save timer.
3. **`savingGuardRef`** (ref) — synchronous save-in-progress flag, prevents concurrent saves without requiring `saving` state in the `handleSave` dependency array.

Result: during continuous typing, React re-renders at most ~3/second instead of ~30/second. All save and navigation guards remain accurate via refs.

#### EditorOutline stability

`IntersectionObserver` for heading highlight depends on `headingCount` (not the full headings array). Text edits within existing headings don't add/remove DOM nodes, so the observer stays valid without rebuild.

### Auto-save (debounce 60s)

```
User edits → (300ms) → content state sync → reset 60s timer → timer fires → save API call
```

- Content state sync fires ~300ms after the last keystroke (debounce)
- Each state sync resets the 60s auto-save timer
- When timer fires, call `PUT /api/hub/files/{id}/content`
- During save: status shows "Saving..."
- After save: status shows "Saved" with timestamp
- If save fails: status shows "Save failed", keep dirty state, will retry on next edit or manual save
- If save hits 409 `CONTENT_CONFLICT`: stop auto-save until user resolves the conflict
- If 429 (rate limited): silently delay and retry on next edit trigger, do not show error toast

### Manual save (Ctrl+S)

- Cancels any pending auto-save timer
- Saves immediately
- Same status indicators as auto-save

### On navigation away

**In-app navigation** (React Router `useBlocker`):
- If dirty, show confirmation dialog: "You have unsaved changes. Save before leaving?"
- Options: "Save and leave" / "Discard" / "Cancel"
- "Save and leave": `await save()` completes, then navigate

**Browser close/refresh** (`beforeunload`):
- Browser shows native confirmation dialog
- No async save attempt (browser does not allow it) — user must manually save first or accept data loss

### Status indicator states

| State | Display |
|-------|---------|
| Clean (no changes) | "Saved" + last save time |
| Dirty (unsaved changes) | "Unsaved changes" |
| Saving in progress | "Saving..." |
| Save failed | "Save failed" (with retry hint) |
| Conflict detected | "Out of date" / reload required |

---

## Export

### Export as `.md`

- Button in editor header
- Get the latest in-memory Markdown string from the editor
- Trigger browser download with original filename

### Export as PDF

- Button in editor header and in share preview page
- Zero extra dependencies — uses browser native print-to-PDF
- `@media print` CSS handles: page margins, font sizing, code block styling, table borders, page-break rules

**In editor page** (`/doc/edit/:id`):
1. Click "Export PDF" (Print icon in header)
2. `window.print()` directly on current page
3. `@media print` CSS hides header, sidebar, status bar, and all editor chrome (toolbar, block handles, gap cursor, slash menu, link preview, image edit overlay, placeholder)
4. Print source is the live ProseMirror DOM itself — no hidden `MilkdownPreview` div needed

**Design decision — why not a hidden MilkdownPreview for print:**
ProseMirror renders semantic HTML (h1, p, ul, table, img, blockquote, pre, etc.) that is identical to what Crepe readonly mode produces. The only extra DOM nodes are editor chrome (toolbar, block handles, gap cursor), which are all hidden via `@media print` rules in `typora-editor.css`. Using a separate hidden `MilkdownPreview` would double memory usage (two Crepe instances), require syncing content before every print, and add complexity for no visible improvement in output quality. If edge cases arise (e.g., CodeMirror artifacts in code blocks), they can be fixed by adding print CSS rules rather than introducing a second editor instance.

**In share preview page** (`/t/{token}`):
- Content is already rendered as readonly preview on the page
- Click "Export PDF" → `window.print()` directly on current page
- `@media print` CSS hides download buttons, nav bar, and other non-content elements
- No extra route needed — the share page itself is the print source

---

## API Service

Add to `frontend/src/services/hubApi.ts`:

```typescript
// Read single-file metadata
export function getFileMeta(id: number): Promise<{
  id: number
  file_name: string
  size: number
  content_type: string
  expires_at: string | null
  updated_at: string
}>

// Read markdown content (owner)
export function getFileContent(id: number): Promise<{ content: string; updated_at: string }>

// Save markdown content (owner)
export function saveFileContent(
  id: number,
  content: string,
  baseUpdatedAt: string,
): Promise<{ size: number; updated_at: string }>

// Upload image for a document
export function uploadEditorImage(
  docId: number,
  file: File,
): Promise<{ file_id: string; url: string }>

// Read shared markdown content (public)
export function getShareFileContent(token: string, fileId: number, code?: string): Promise<{ content: string }>
```

---

## Routes

Add `doc/edit/:id` as a protected route outside `DashboardLayout`:

```tsx
{ path: 'doc/edit/:id', element: <ProtectedRoute><DocEditorPage /></ProtectedRoute> },
```

If the app keeps this route under `RootLayout` for auth/bootstrap reuse, `RootLayout` must special-case `/doc/edit/:id` and suppress:
- Global site header
- Global footer
- The normal max-width content container

Resulting UX requirement: the editor behaves as a full-screen standalone workspace.

Share preview reuses the existing `/t/{token}` page — no new route needed.
PDF export uses `window.print()` on the current page — no separate print route needed.

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| File not `.md` extension | Redirect to Hub with error toast |
| Invalid rename for Markdown file | Toast + keep current filename/editor state |
| Content decode fails (binary) | Show error page: "This file cannot be displayed as Markdown" with download link |
| Existing file already > 1 MB | Open editor with warning; disable save until content is reduced |
| Content approaching 1 MB (>900 KB) | Status bar warning: "Approaching size limit" |
| Content > 1 MB on save | Toast: "Content exceeds 1 MB limit", refuse save |
| Save would exceed quota | Toast: "Storage quota exceeded", keep dirty state |
| 409 `CONTENT_CONFLICT` | Show conflict dialog with reload-latest guidance |
| Network error on save | Toast: "Save failed", keep dirty state, auto-retry on next trigger |
| File expired/deleted | Error page with link back to Hub |
| Share content fetch fails | Fall back to download-only |
| Image type not in whitelist | Toast: "Only PNG, JPEG, GIF, and WebP images are supported" |
| Image magic bytes mismatch | 400: rejected by backend even if content-type header was spoofed |
| Image > 5 MB | Toast: "Image must be smaller than 5 MB" |
| Image upload quota exceeded | Toast: "Storage quota exceeded" |
| Image upload network error | Toast: "Image upload failed", image insertion cancelled |

---

## i18n

Add a new `docs` namespace via:
- `frontend/public/locales/en/docs.json`
- `frontend/public/locales/zh-CN/docs.json`

Representative translation keys:

| Key | Chinese | English |
|-----|---------|---------|
| `docs.newDocument` | New Document | New Document |
| `docs.save` | Save | Save |
| `docs.saved` | Saved | Saved |
| `docs.unsavedChanges` | Unsaved changes | Unsaved changes |
| `docs.saving` | Saving... | Saving... |
| `docs.saveFailed` | Save failed | Save failed |
| `docs.export` | Export | Export |
| `docs.exportMd` | Export .md | Export .md |
| `docs.exportPdf` | Export PDF | Export PDF |
| `docs.discardChanges` | Unsaved changes dialog | You have unsaved changes |
| `docs.notMarkdown` | Not a Markdown file | This file is not a Markdown document |
| `docs.contentTooLarge` | Content too large | Content exceeds 1 MB limit |
| `docs.fileTooLargeToSave` | File too large to save | This file must be reduced below 1 MB before saving |
| `docs.invalidContent` | Invalid content | This file cannot be displayed as Markdown |
| `docs.invalidMarkdownFilename` | Invalid Markdown filename | Markdown documents must keep the .md extension |
| `docs.conflict` | Document out of date | This file was changed in another tab |
| `docs.reloadLatest` | Reload latest | Reload latest |
| `docs.preview` | Preview | Preview |
| `docs.imageNotImage` | 仅支持 PNG、JPEG、GIF、WebP 格式的图片 | Only PNG, JPEG, GIF, and WebP images are supported |
| `docs.imageTooLarge` | Image too large | Image must be smaller than 5 MB |
| `docs.imageUploadFailed` | Upload failed | Image upload failed |

(Full Chinese translations during implementation)

---

## Implementation Order

| Phase | Task | Details |
|-------|------|---------|
| 1 | Backend endpoints | Single-file metadata endpoint + content endpoints + `FileService.overwrite_bytes` + content/quota validation |
| 2 | Editor rendering layer | `TyporaEditor` (Crepe WYSIWYG) + `MilkdownPreview` (Crepe readonly) |
| 3 | Editor page | `DocEditorPage` with auto-save + manual save + dirty state + oversize handling + export |
| 4 | Hub integration | "New Document" button + click file name / Edit action for `.md` files |
| 5 | Share preview | `MilkdownPreview` readonly on `/t/{token}` for `.md` shares, reusing existing extract-code flow |
| 6 | Polish | `EditorOutline` sidebar, `EditorStatusBar`, header UX, loading skeleton, print CSS, i18n |
| 7 | Editor images | Backend: `parent_file_id` column + image upload endpoint (type whitelist + magic bytes) + public serve endpoint (200/min) + save-time GC + pending expiration. Frontend: image compression utility + enable `ImageBlock` + `onUpload` callback + upload tracking for save concurrency. Config: `MAX_EDITOR_IMAGE_MB=5`, `ALLOWED_IMAGE_TYPES` |
