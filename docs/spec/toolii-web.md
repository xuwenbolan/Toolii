# toolii-web Module Spec

Status: draft | Updated: 2026-03-10

## Role

Static SPA serving + reverse proxy. No business logic.

## Tech Stack

| Item | Value |
|------|-------|
| Framework | React 18 + TypeScript + Vite |
| UI | TailwindCSS + shadcn/ui |
| Serving | nginx:1.27-alpine |
| Port | 8001 (external) |

## Ownership

### Web OWNS

- Serve frontend static assets (JS/CSS/images)
- Reverse proxy `/api/*` requests to backend (port 8000)
- Client-side routing (SPA fallback to index.html)
- CSP headers and static security headers

### Web does NOT own

- Any business logic or data processing
- Direct communication with Cortex
- User auth verification (delegates to backend API)
- File storage or database access

## Nginx Proxy Rules

```
/api/*     -> http://backend:8000
/*         -> static files (SPA fallback)
```

## Routing Map

### Public Tool Routes

| Route | Component | i18n NS |
|-------|-----------|---------|
| `/id-photo` | `IdPhotoPage` | `idPhoto` |
| `/facemap` | `FaceMapPage` | `faceMap` |
| `/face-similarity` | `FaceSimilarityPage` | `faceSimilarity` |
| `/transfer` | `TransferCreatePage` | `transfer` |
| `/t/:token` | `TransferReceivePage` | `transfer` |
| `/r/:token` | `ResultSharePage` | `resultShare` |

**Image Tools** (`/image-tools`)

| Route | Component | Backend Tool Name |
|-------|-----------|-------------------|
| `/compress` | `CompressPage` | `image/compress` |
| `/heic-to-jpg` | `HeicToJpgPage` | `image/heic-to-jpg` |
| `/convert` | `ConvertPage` | `image/convert` |
| `/remove-bg` | `RemoveBgPage` | `image/remove-bg` |
| `/upscale` | `UpscalePage` | `image/upscale` |
| `/restore-face` | `RestoreFacePage` | `image/restore-face` |
| `/denoise` | `DenoisePage` | `image/denoise` |
| `/colorize` | `ColorizePage` | `image/colorize` |
| `/inpaint` | `InpaintPage` | `image/inpaint` |
| `/ocr` | `OcrPage` | `image/ocr` |
| `/segment` | `SegmentPage` | `image/segment` |
| `/mosaic` | `MosaicPage` | `image/mosaic` |
| `/scan-enhance` | `ScanEnhancePage` | `image/scan-enhance` |
| `/{format-pair}` | `FormatConvertPage` | (dynamic from `FORMAT_PAIRS`) |

**PDF Tools** (`/pdf-tools`) — all sub-routes render `PdfToolsPage` with mode param

| Route | Mode |
|-------|------|
| `/` | default |
| `/compress` | compress |
| `/merge` | merge |
| `/pages` | pages |
| `/from-images` | from-images |
| `/split` | split |

**Text Tools** (`/text-tools`)

| Route | Component |
|-------|-----------|
| `/word-counter` | `WordCounterPage` |

### Protected Routes

| Route | Component | Notes |
|-------|-----------|-------|
| `/doc/edit/:id` | `DocEditorPage` | Milkdown markdown editor |
| `/dashboard` | `OverviewPage` | User dashboard index |
| `/dashboard/hub` | `HubFilesPage` | File hub (files + docs + shares) |
| `/dashboard/transactions` | `TransactionHistoryPage` | |
| `/dashboard/history` | `ProcessingHistoryPage` | |
| `/dashboard/redeem` | `RedeemPage` | |
| `/dashboard/settings` | `SettingsPage` | |
| `/dashboard/feedback` | `FeedbackPage` | |

### Admin Routes (`/console`)

Separate layout (`ConsoleLayout`) with `AdminRoute` guard.

### Naming Conventions

- Route paths: kebab-case
- Component names: PascalCase + `Page` suffix
- i18n namespace: camelCase
- Backend tool name: `{category}/{slug}`

## i18n Namespaces

Defined in `frontend/src/config/i18n.ts`. Files in `frontend/public/locales/{lng}/{ns}.json`.

| Namespace | Scope |
|-----------|-------|
| `common` | shared UI (nav, home, actions) |
| `tools` | image tools + PDF tools |
| `textTools` | text tools |
| `idPhoto` | ID photo |
| `faceMap` | FaceMap analysis |
| `faceSimilarity` | face similarity |
| `credits` | credits & payment |
| `auth` | login, register, password |
| `legal` | privacy policy, terms |
| `consent` | cookie consent |
| `console` | admin console |
| `transfer` | file transfer |
| `hub` | file hub / dashboard files |
| `docs` | markdown editor |
| `resultShare` | shared result pages |

## Performance Budget

### Loading

| Metric | Target |
|--------|--------|
| First Contentful Paint (FCP) | < 1.5s (4G) |
| Largest Contentful Paint (LCP) | < 2.5s (4G) |
| Total blocking time (TBT) | < 200ms |
| Initial JS bundle (gzipped) | < 200KB |

### Runtime

| Interaction | Target |
|-------------|--------|
| Canvas preview update (mosaic, compress slider) | < 16ms (60fps) |
| Text stats update on keystroke | < 50ms |
| PDF thumbnail render per page | < 200ms |
| Comparison slider drag | 0ms perceived lag |
| File drop zone response | < 100ms |

### Asset Budgets

| Asset type | Budget |
|-----------|--------|
| Tool illustration SVG | < 5KB each |
| Lucide icons (tree-shaken) | ~200B each |
| Source Sans 3 font (4 weights, woff2) | ~60KB via @fontsource |
| Source Code Pro font (2 weights, woff2) | ~30KB via @fontsource |

### Minimum Device Target

- **Mobile:** 2019+ mid-range Android (4GB RAM)
- **Desktop:** Chrome/Firefox/Safari/Edge, last 2 major versions
- **Network:** Functional on 3G; optimized for 4G+

## Shared Hooks Architecture

### useFileUpload

Core upload lifecycle hook. Manages `pending`, `progress`, `error`, `errorMeta` state. Features:
- AbortController: auto-aborts previous in-flight request on new `run()`, cleanup on unmount
- Retry: stores last task for `retry()` callback
- Returns `abort()` for external cancellation

### useImageTool\<T\>

Composition hook for single-file image tool pages. Built on `useFileUpload` + `useObjectUrl` + `useToolRunState`. Manages:
- File selection (`file`, `handleFiles`)
- Result state (`result`, `resultPanelOpen`)
- Input preview URL (auto blob URL lifecycle)
- `runTool(apiCall)` with error handling

Tool-specific options (e.g. model, quality, strength) remain as local state in each page.

### useHubDialogs

Manages all dialog state for HubFilesPage: rename, extend, delete (single + batch), share (single + batch). Returns `actions` (wire into file views) and `dialogProps` (spread into `HubDialogs` compound component).

## Admin Page Architecture

`AdminSystemPage` is a thin orchestrator (~180 lines) composing:
- `CortexStatusCard` — GPU dashboard (VRAM gauges, queue, alerts)
- `CortexModelsList` — Model table with enable/disable/unload/check actions
- `CortexTimeline` — Recent event log

Shared utilities live in `cortex-helpers.ts` (format functions, color maps, alert logic).

## Related Specs

- [frontend-design.md](frontend-design.md) — Visual identity, interaction patterns, design tokens
- [frontend-upgrade.md](frontend-upgrade.md) — Upgrade roadmap
