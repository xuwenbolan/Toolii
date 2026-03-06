# File Progress Components (通用文件传输进度)

Status: draft | Updated: 2026-03-06

Universal upload and download progress UI components, used across all file transfer scenarios.

---

## Current State & Problems

### Upload Progress

- `useFileUpload` hook exists, tracks `progress` (0-100) and `pending` state -- works well
- `UploadProgress` component exists (`components/upload/UploadProgress.tsx`) -- simple progress bar with label and percentage
- `getProgressHandler` utility duplicated across `imageApi.ts`, `pdfApi.ts`, `idPhotoApi.ts` -- should be extracted

### Download Progress

- `useFileDownload` hook uses `fetch()` with no progress tracking
- `DownloadButton` / `GatedDownloadButton` show only a spinner (Loader2) during download, no percentage
- For large files (file transfer, file locker, video tools), a spinner is insufficient

---

## Design

### 1. Extract `getProgressHandler` to shared utility

Move duplicated `getProgressHandler` from `imageApi.ts` / `pdfApi.ts` / `idPhotoApi.ts` into a shared location.

```
src/lib/progress.ts

export function axiosProgressHandler(
  onProgress?: (percent: number) => void,
  fallbackTotal?: number,
): ((evt: AxiosProgressEvent) => void) | undefined
```

All API service files import from here instead of defining their own copy.

### 2. `useFileDownload` with progress

Extend the existing hook to report download progress via `ReadableStream`.

```
src/hooks/useFileDownload.ts

type DownloadState = {
  downloading: boolean
  progress: number | null   // 0-100, null when not downloading or size unknown
}

export function useFileDownload(): {
  state: DownloadState
  download: (url: string, filename?: string) => Promise<void>
}
```

Implementation notes:
- Use `fetch()` + `response.body.getReader()` to read chunks and track `loaded / Content-Length`
- If `Content-Length` header is missing (e.g. chunked response), `progress` stays `null` -- caller shows indeterminate state
- Fallback behavior (WeChat, fetch failure) remains unchanged

### 3. `TransferProgress` component

A unified progress component that handles both upload and download, replacing the current `UploadProgress` for all scenarios.

```
src/components/common/TransferProgress.tsx

type Props = {
  /** 0-100, or null for indeterminate */
  value: number | null
  /** "upload" | "download" -- determines default label and icon */
  direction: 'upload' | 'download'
  /** Override default label */
  label?: string
  /** File name being transferred (shown below progress bar) */
  fileName?: string
  /** File size in bytes (shown as "12.3 MB") */
  fileSize?: number
  /** Compact mode: single line, no file info */
  compact?: boolean
}
```

Visual states:

| State | Appearance |
|-------|------------|
| `value = 0` | Empty bar, "Preparing..." |
| `value = 1-99` | Filling bar, percentage, speed (if calculable) |
| `value = 100` | Full bar, brief green flash, then auto-hide or show checkmark |
| `value = null` | Indeterminate animation (pulsing bar) |

Layout (default mode):
```
[Upload icon] Uploading...                    67%
[=============================             ]
report.pdf                              12.3 MB
```

Layout (compact mode):
```
[=============================             ] 67%
```

Design tokens follow existing pattern: `bg-muted` track, `bg-primary` fill, `text-muted-foreground` labels. Uses `motion-reduce:transition-none` for accessibility.

### 4. `TransferProgressList` component

For scenarios with multiple concurrent transfers (e.g. batch download from file locker).

```
src/components/common/TransferProgressList.tsx

type TransferItem = {
  id: string
  fileName: string
  fileSize?: number
  direction: 'upload' | 'download'
  progress: number | null
  status: 'pending' | 'active' | 'done' | 'error'
  error?: string
}

type Props = {
  items: TransferItem[]
  /** Summary line: "3 / 5 completed" */
  showSummary?: boolean
}
```

Each item renders as a compact `TransferProgress`. Items with `status: 'done'` collapse or show a checkmark. Items with `status: 'error'` show error message in red.

---

## Usage by Module

| Module | Upload | Download |
|--------|--------|----------|
| Image tools | `useFileUpload` + `TransferProgress(compact)` | `useFileDownload` (small files, spinner sufficient) |
| PDF tools | `useFileUpload` + `TransferProgress(compact)` | `useFileDownload` (small files, spinner sufficient) |
| File transfer | `useFileUpload` + `TransferProgress` | `useFileDownload` + `TransferProgress` |
| File locker | `useFileUpload` + `TransferProgress` | `useFileDownload` + `TransferProgress` |
| Video tools | `useFileUpload` + `TransferProgress` | `useFileDownload` + `TransferProgress` |
| ID photo | `useFileUpload` + `TransferProgress(compact)` | `useFileDownload` (small files, spinner sufficient) |

Rule of thumb: files likely > 5 MB show full progress with file info; smaller files use compact mode or spinner.

---

## Migration Plan

1. Extract `axiosProgressHandler` to `src/lib/progress.ts`, update imports in `imageApi.ts`, `pdfApi.ts`, `idPhotoApi.ts`
2. Build `TransferProgress` component, deprecate `UploadProgress`
3. Extend `useFileDownload` with progress tracking via ReadableStream
4. Build `TransferProgressList` for batch scenarios
5. Integrate into file transfer and file locker pages
6. Retrofit image/PDF tools to use `TransferProgress(compact)` (optional, low priority)

Steps 1-3 are prerequisites for file locker. Steps 4-6 can follow incrementally.
