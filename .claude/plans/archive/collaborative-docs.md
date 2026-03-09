# Collaborative Docs: Implementation Plan

Spec: [/docs/spec/collaborative-docs.md](/docs/spec/collaborative-docs.md)

## Architecture Decisions

- **Editor**: Milkdown (ProseMirror + remark, Typora-style WYSIWYG Markdown)
- **Real-time sync**: Yjs CRDT + y-websocket (Node.js sidecar)
- **Persistence**: Yjs state stored as BLOB in SQLite (via y-websocket → FastAPI callback), no LevelDB
- **Auth**: JWT token passed as WebSocket query param, validated by custom y-websocket wrapper
- **Backend**: FastAPI handles document CRUD + Yjs state persistence endpoints
- **Quota**: max 2 documents per user (as owner)
- **Collaboration invite**: by email only (no invite links)

## Phase 0: Technical Spike (validate before building)

Goal: prove the critical path works end-to-end in isolation.

1. Set up a minimal y-websocket server locally (`npx y-websocket`)
2. Create a throwaway React page with Milkdown + `@milkdown/plugin-collaborative` + `y-websocket` provider
3. Open two browser tabs, verify real-time sync works
4. Add JWT auth hook to y-websocket, verify unauthorized connections are rejected
5. Restart y-websocket, verify document state survives (custom persistence to SQLite via FastAPI)

**Exit criteria**: two tabs can co-edit a Markdown document with live sync, auth works, persistence works.

**Risk mitigation**: if y-websocket's auth hook is insufficient, fall back to a thin Express wrapper that validates JWT before proxying to y-websocket.

## Phase 1: Backend — Document metadata

### 1.1 Database model

- Create `Document` SQLAlchemy model in `backend/app/models/document.py`
- Fields: id, user_id, title, collaborator_id, yjs_state (BLOB), is_archived, created_at, updated_at
- Alembic migration

### 1.2 Schemas

- Create `backend/app/schemas/document.py`
- `DocumentCreate` (title)
- `DocumentUpdate` (title)
- `DocumentResponse` (id, title, owner, collaborator, timestamps)
- `CollaboratorSet` (email)

### 1.3 Service

- Create `backend/app/services/document_service.py`
- `create_document(user_id, title)` → Document
- `list_documents(user_id)` → owned + collaborated
- `get_document(doc_id, user_id)` → with access check
- `update_document(doc_id, user_id, title)`
- `delete_document(doc_id, user_id)` → owner only
- `set_collaborator(doc_id, user_id, collaborator_email)` → owner only, lookup user by email
- `remove_collaborator(doc_id, user_id)` → owner only
- `check_access(doc_id, user_id)` → bool (used by y-websocket auth)

### 1.4 Router

- Create `backend/app/routers/docs.py`
- Mount at `/api/docs` in main.py
- All endpoints require authentication
- `POST /api/docs` — create
- `GET /api/docs` — list
- `GET /api/docs/{id}` — get
- `PATCH /api/docs/{id}` — update title
- `DELETE /api/docs/{id}` — delete
- `POST /api/docs/{id}/collaborator` — set collaborator
- `DELETE /api/docs/{id}/collaborator` — remove collaborator

### 1.5 Access check endpoint for y-websocket

- `GET /api/docs/{id}/access?user_id={uid}` — internal endpoint (not exposed publicly)
- Returns 200 if user has access, 403 if not
- Called by y-websocket auth hook to validate connections
- Secured by internal network (only accessible from toolii-net)

## Phase 2: y-websocket service

### 2.1 Custom y-websocket wrapper

Create `yws/` directory at project root:

```
yws/
├── package.json        # y-websocket + jsonwebtoken deps
├── server.js           # Custom server with JWT auth hook
└── Dockerfile          # Node 22 alpine
```

`server.js` responsibilities:
- Start y-websocket with custom persistence provider (no LevelDB)
- Persistence provider calls FastAPI to load/save Yjs state:
  - `GET /api/internal/docs/{doc_id}/yjs` → returns BLOB
  - `PUT /api/internal/docs/{doc_id}/yjs` → saves BLOB
- On WebSocket connection:
  - Extract `token` from URL query params
  - Verify JWT signature using shared `JWT_SECRET`
  - Extract `user_id` from JWT payload
  - Call FastAPI `GET /api/docs/{doc_id}/access?user_id={uid}` (internal HTTP)
  - If access denied → close connection with code 4401
  - If access granted → proceed with Yjs sync

### 2.2 Docker Compose

- Add `yws` service to `docker/docker-compose.yml`
- No volume needed (state persisted to SQLite via FastAPI)
- Expose port 4444 on internal network
- Share `JWT_SECRET` env var with backend

### 2.3 Nginx config

- Add WebSocket proxy location `/yws/` → `toolii-yws:4444`
- Set proper headers for WebSocket upgrade

## Phase 3: Frontend — Editor

### 3.1 Dependencies

```
pnpm add @milkdown/kit @milkdown/react @milkdown/plugin-collaborative
pnpm add yjs y-websocket
pnpm add @milkdown/theme-nord  # or custom theme
```

### 3.2 Editor component

- Create `frontend/src/components/docs/MilkdownEditor.tsx`
- Initialize Milkdown with plugins:
  - `commonmark` (basic Markdown syntax)
  - `gfm` (tables, strikethrough, task lists)
  - `collaborative` (Yjs binding)
  - `listener` (track changes for save indicator)
  - `history` (undo/redo via Yjs)
- Connect to y-websocket: `new WebsocketProvider('wss://host/yws', docId, ydoc)`
- Pass JWT token as query param in WebSocket URL
- Handle connection states: connected / connecting / disconnected

### 3.3 Toolbar component

- Create `frontend/src/components/docs/EditorToolbar.tsx`
- Buttons: H1-H3, bold, italic, strikethrough, bullet list, ordered list, task list, code block, blockquote, link, table, horizontal rule
- Use Radix UI + Tailwind for styling (match existing project UI)
- Keyboard shortcuts (Ctrl+B, Ctrl+I, etc.)

### 3.4 Collaboration UI

- Collaborator cursor with name label + color
- Sync status indicator: "Synced" / "Syncing..." / "Offline"
- Reconnect logic: on disconnect, retry with exponential backoff; on JWT expiry, refresh token and reconnect

### 3.5 Pages

- Create `frontend/src/pages/Docs/DocListPage.tsx`
  - List owned + shared documents
  - Create new document button
  - Row actions: open, rename, delete, manage collaborator
- Create `frontend/src/pages/Docs/DocEditorPage.tsx`
  - Load document metadata via REST
  - Initialize Milkdown editor with collaboration
  - Title editing (inline, auto-save)
  - Share/invite collaborator dialog

### 3.6 Routes

Add to `frontend/src/routes/index.tsx`:

```tsx
{ path: 'docs', element: <ProtectedRoute><DocListPage /></ProtectedRoute> },
{ path: 'docs/:id', element: <ProtectedRoute><DocEditorPage /></ProtectedRoute> },
```

### 3.7 API service

- Create `frontend/src/services/docApi.ts`
- Functions for all REST endpoints (create, list, get, update, delete, collaborator ops)
- Use existing axios instance with auth interceptors

## Phase 4: Markdown Import/Export

### 4.1 Export (frontend-only)

- Get Markdown string from Milkdown editor via `editor.action(getMarkdown())`
- Trigger browser download as `.md` file
- No backend involvement needed

### 4.2 Import

- File picker accepts `.md` files
- Read file content as string
- Create new document via REST API
- Initialize Milkdown editor with imported content
- Yjs will sync the initial content to y-websocket for persistence

## Phase 5: Polish & Integration

### 5.1 Navigation

- Add "Docs" to homepage tool grid
- Add "Docs" link to sidebar/header navigation

### 5.2 Edge cases

- Handle deleted documents (collaborator opens stale link)
- Handle removed collaborator (disconnect WebSocket gracefully)
- Handle concurrent title edits (last-write-wins is fine for title)
- Document count limit: enforce max 2 per user in create endpoint

### 5.3 i18n

- Add translation keys for docs UI (zh-CN + en)

### 5.4 Mobile

- Read-only view on small screens, or responsive toolbar

## Implementation Order

| Order | Task | Depends On |
|-------|------|------------|
| 1 | Phase 0: Technical spike | Nothing |
| 2 | Phase 1: Backend CRUD | Nothing |
| 3 | Phase 2: y-websocket service | Phase 0 validates approach |
| 4 | Phase 3: Frontend editor + pages | Phase 1 + Phase 2 |
| 5 | Phase 4: Import/export | Phase 3 |
| 6 | Phase 5: Polish | Phase 3 + Phase 4 |

Phase 1 and Phase 0 can run in parallel. Phase 2 builds on Phase 0's findings.
