# Markdown Online Editor

Status: draft | Updated: 2026-03-07

Online Markdown editing and preview, built on top of [File Hub](file-hub.md). Users can create, edit, and preview `.md` files directly in the browser using a WYSIWYG editor (Milkdown). Shared `.md` files render as formatted preview pages instead of raw downloads.

---

## Scope

**In scope:**
- Create new `.md` documents (saved as Hub files)
- Edit existing `.md` files in a WYSIWYG Markdown editor
- Preview `.md` files (read-only rendered view)
- Shared `.md` files default to online preview with download button
- Auto-save (debounce 10s) + manual save (Ctrl+S) + unsaved-changes guard on leave
- Export as `.md` file and PDF

**Out of scope:**
- Real-time collaboration / multi-user editing
- Version history / diff
- Editing non-`.md` files (`.txt`, etc.)
- Image upload/paste (text-only storage; external image URLs in Markdown syntax render normally)

---

## Architecture

### Storage

Documents are regular Hub files with `content_type = "text/markdown"`. No separate database table. All Hub features (quota, expiration, rename, delete, share) apply automatically.

### Content size limit

Markdown content is capped at **1 MB** per file. Enforced at backend content endpoints and frontend.

### Content safety

Backend must validate that the file is genuinely text (decodable as UTF-8) on both read and write. This prevents:
- Renaming a binary file to `.md` and then hitting the content endpoint (would fail UTF-8 decode)
- Uploading a non-text file with `text/markdown` content type

On `GET /content`: if UTF-8 decode fails, return 422 with `"INVALID_CONTENT"` error.
On `PUT /content`: validate the incoming string re-encodes cleanly to UTF-8 (guaranteed by JSON, but enforce size limit on the encoded bytes).

### Backend

Three new endpoints on the Hub router:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/hub/files/{id}/content` | User (owner) | Read file content as JSON `{ content: string }` |
| `PUT` | `/api/hub/files/{id}/content` | User (owner) | Save content, returns `{ size: int }` |
| `GET` | `/api/hub/s/{token}/{file_id}/content` | Public (+ extract code) | Read shared file content for preview |

#### `GET /api/hub/files/{id}/content`

- Verify file belongs to user, is active, and has `.md` extension in filename
- Read file bytes from FileService, decode as UTF-8
- If decode fails, return 422 `INVALID_CONTENT`
- Return `{ "content": "..." }`

#### `PUT /api/hub/files/{id}/content`

- Rate limit: **30/minute** (higher than default to accommodate auto-save + manual Ctrl+S)
- Verify file belongs to user, is active, and has `.md` extension in filename
- Accept JSON body `{ "content": "..." }`
- Encode to UTF-8, validate size <= 1 MB
- Write new bytes to FileService (overwrite existing file_id)
- Update `user_files.size` in database
- Return `{ "size": <new_byte_size> }`

#### `GET /api/hub/s/{token}/{file_id}/content`

- Same auth logic as existing share download (token + optional extract code)
- Verify file has `.md` extension
- Read and decode as UTF-8, return `{ "content": "..." }`

**Note on markdown detection:** Use filename extension (`.md`) rather than `content_type` field. This is more reliable — users may upload files with correct extension but wrong MIME type, or vice versa. The `.md` extension is the user-visible contract: "this file is editable as Markdown."

### FileService change

Add an `overwrite_bytes` method to `FileService`:

```python
def overwrite_bytes(self, file_id: str, data: bytes) -> int:
    """Overwrite an existing file's content. Returns new size."""
    path = self._file_path(file_id)
    if not path.exists():
        raise FileNotFoundError(file_id)
    path.write_bytes(data)
    return len(data)
```

In-place content update without changing `file_id`, so share links stay valid.

---

## Frontend

### Dependencies

```
pnpm add @milkdown/kit @milkdown/theme-nord
```

Milkdown v7: ProseMirror-based WYSIWYG Markdown editor. `@milkdown/kit` includes core, commonmark, gfm, and essential plugins.

### Components

#### `MilkdownEditor`

Location: `frontend/src/components/editor/MilkdownEditor.tsx`

Props:
- `initialContent: string` — Markdown text to load
- `readonly?: boolean` — If true, render as preview (no editing)
- `onChange?: (markdown: string) => void` — Called on content change

Mobile: editor is functional but not optimized; no mobile-specific restrictions for now.

Plugins:
- `commonmark` — Headings, bold, italic, lists, code, links, images, blockquote
- `gfm` — Tables, strikethrough, task lists
- `history` — Undo/redo
- `listener` — Track changes

#### `EditorToolbar`

Location: `frontend/src/components/editor/EditorToolbar.tsx`

Minimal toolbar:
- Headings (H1-H3)
- Bold, Italic, Strikethrough
- Bullet list, Ordered list, Task list
- Code block, Blockquote
- Link, Horizontal rule, Table

Styled with Radix UI + Tailwind.

### Pages

#### `DocEditorPage`

Location: `frontend/src/pages/Docs/DocEditorPage.tsx`
Route: `/doc/edit/:id`
Layout: **Full-screen standalone** — no DashboardLayout, no sidebar. Header has: back button (→ Hub), file name (clickable to rename), save status indicator, save button, export dropdown.

Flow:
1. Fetch file metadata to verify it exists and has `.md` extension
2. Fetch content (`GET /api/hub/files/{id}/content`)
3. Render `MilkdownEditor` with content
4. Track dirty state (content changed since last save)
5. Save triggers:
   - **Auto-save**: debounce 10 seconds after last edit
   - **Manual**: Ctrl+S (Cmd+S on Mac) or Save button
   - **On leave**: if dirty, attempt save before navigating away
6. Unsaved changes guard: `beforeunload` + React Router `useBlocker`

#### New document creation

"New Document" button in both **homepage tool grid** and `HubFilesPage` header:
- Generates filename with timestamp: `untitled-MMDDHHmm.md` (e.g. `untitled-03071430.md`)
- Creates a blank `.md` file via `POST /api/hub/upload` (empty content, timestamped filename, content type `text/markdown`)
- Navigates to `/doc/edit/:id`

No need to query existing files — timestamp ensures uniqueness.

### Homepage Integration

Add "Markdown Editor" as a tool entry on the homepage tool grid:
- Icon + title + brief description
- Click → navigate to `/dashboard/hub?tab=docs` (or a doc list view within Hub)
- Requires login (redirect to auth if not logged in)

### Hub Page Integration

In `HubFilesPage`, for files with `.md` extension:
- Click file name → navigate to `/doc/edit/:id`
- Add "Edit" icon button in file row actions
- Non-`.md` files: click-to-download (existing behavior)

### Share Page Integration

In `TransferReceivePage` (`/t/{token}`):

**Single `.md` file:**
- Auto-fetch content via `GET /api/hub/s/{token}/{file_id}/content`
- Render `MilkdownEditor` in readonly mode as preview
- Show download button (`.md`) and "Export PDF" button below preview

**Multiple files (with some `.md`):**
- Keep existing file list UI
- `.md` files get a "Preview" button → opens modal with readonly `MilkdownEditor`

**Fallback:** If content fetch fails (binary file renamed to `.md`, decode error), fall back to download-only with a note.

---

## Save Strategy

### Auto-save (debounce 10s)

```
User edits → reset 10s timer → timer fires → save API call
```

- Each keystroke/edit resets the timer
- When timer fires, call `PUT /api/hub/files/{id}/content`
- During save: status shows "Saving..."
- After save: status shows "Saved" with timestamp
- If save fails: status shows "Save failed", keep dirty state, will retry on next edit or manual save
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

---

## Export

### Export as `.md`

- Button in editor header
- Get raw Markdown string from Milkdown editor
- Trigger browser download with original filename

### Export as PDF

- Button in editor header and in share preview page
- Zero extra dependencies — uses browser native print-to-PDF
- `@media print` CSS handles: page margins, font sizing, code block styling, table borders, page-break rules

**In editor page** (`/doc/edit/:id`):
1. Click "Export PDF"
2. `window.print()` directly on current page
3. `@media print` CSS hides toolbar, header, and other non-content elements

**In share preview page** (`/t/{token}`):
- Content is already rendered as readonly preview on the page
- Click "Export PDF" → `window.print()` directly on current page
- `@media print` CSS hides download buttons, nav bar, and other non-content elements
- No extra route needed — the share page itself is the print source

---

## API Service

Add to `frontend/src/services/hubApi.ts`:

```typescript
// Read markdown content (owner)
export function getFileContent(id: number): Promise<{ content: string }>

// Save markdown content (owner)
export function saveFileContent(id: number, content: string): Promise<{ size: number }>

// Read shared markdown content (public)
export function getShareFileContent(token: string, fileId: number, code?: string): Promise<{ content: string }>
```

---

## Routes

Add to `frontend/src/routes/index.tsx` as **top-level route** under RootLayout (not inside DashboardLayout, since the editor uses a full-screen standalone layout):

```tsx
{ path: 'doc/edit/:id', element: <ProtectedRoute><DocEditorPage /></ProtectedRoute> },
```

Share preview reuses the existing `/t/{token}` page — no new route needed.
PDF export uses `window.print()` on the current page — no separate print route needed.

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| File not `.md` extension | Redirect to Hub with error toast |
| Content decode fails (binary) | Show error page: "This file cannot be displayed as Markdown" with download link |
| Content approaching 1 MB (>900 KB) | Status bar warning: "Approaching size limit" |
| Content > 1 MB on save | Toast: "Content exceeds 1 MB limit", refuse save |
| Network error on save | Toast: "Save failed", keep dirty state, auto-retry on next trigger |
| File expired/deleted | Error page with link back to Hub |
| Share content fetch fails | Fall back to download-only |

---

## i18n

Translation keys under `docs` namespace (zh-CN / en):

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
| `docs.invalidContent` | Invalid content | This file cannot be displayed as Markdown |
| `docs.preview` | Preview | Preview |

(Full Chinese translations during implementation)

---

## Implementation Order

| Phase | Task | Details |
|-------|------|---------|
| 1 | Backend endpoints | `FileService.overwrite_bytes` + 3 new Hub endpoints + content validation |
| 2 | Milkdown editor component | `MilkdownEditor` + `EditorToolbar` |
| 3 | Editor page | `DocEditorPage` with auto-save + manual save + dirty state + export (print CSS) |
| 4 | Hub page integration | "New Document" button + click-to-edit for `.md` files |
| 5 | Share preview | Readonly preview on `/t/{token}` for `.md` shares |
| 6 | Polish | i18n, error handling, keyboard shortcuts, mobile responsive |
