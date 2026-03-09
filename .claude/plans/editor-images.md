# Editor Images Implementation Plan

Status: active | Created: 2026-03-09

Implements Phase 7 of [md-editor.md](../../docs/spec/md-editor.md#editor-images): image paste/upload in the Markdown editor with Hub storage, save-time GC, and public serving.

---

## Overview

用户在编辑器中粘贴/拖放图片 → 前端校验+压缩 → 上传到 Hub 存储 → 返回公开 URL 插入文档。保存时扫描 markdown 中的图片引用，删除孤儿图片。图片过期策略跟随父文档。

---

## Step 1: Backend Config

File: `backend/app/core/config.py`

- Add `max_editor_image_mb: int = 5` to Settings
- Add `ALLOWED_IMAGE_TYPES` constant:
  ```python
  ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp"}
  ```

---

## Step 2: UserFile Model — New Column + Source Value

File: `backend/app/models/user_file.py`

- Add `"editor_image"` to `FileSource`:
  ```python
  EDITOR_IMAGE = "editor_image"
  ```
- Add `parent_file_id` column:
  ```python
  # Parent document id for editor images (indexed for GC and lifecycle queries)
  parent_file_id: Mapped[int | None] = mapped_column(
      Integer, nullable=True, index=True
  )
  ```
- Schema migration needed for `parent_file_id` column (Alembic)

---

## Step 3: HubService — Image Upload Method

File: `backend/app/services/hub_service.py`

Add method:

```python
async def upload_editor_image(
    self, doc_id: int, user_id: int, *, filename: str, data: bytes, content_type: str,
) -> tuple[str, str]:
    """Upload an image for a markdown document. Returns (file_id, url)."""
```

Logic:
1. Verify parent doc: `get_file(doc_id, user_id)` — must be active, `.md` extension
2. Validate `content_type in ALLOWED_IMAGE_TYPES` (whitelist: png, jpeg, gif, webp)
3. Validate magic bytes match declared content_type (file header check)
4. Validate `len(data) <= settings.max_editor_image_mb * 1024 * 1024`
5. `_check_quota(user_id, additional_bytes=len(data), additional_count=1)`
6. `fs.save_bytes(data)` -> get `StoredFile(file_id, path, size)`
7. Create `UserFile` record:
   - `user_id`, `file_id`, `original_filename=filename`, `size=len(data)`, `content_type`
   - `source="editor_image"`
   - `status="pending"`
   - `parent_file_id=doc_id`
   - `expires_at`: copy from parent doc's `expires_at`; if parent is NULL (unlimited), set to `utcnow() + 24h`
8. Return `(file_id, f"/api/hub/images/{file_id}")`

### Magic bytes validation

```python
_MAGIC_BYTES = {
    "image/png": b"\x89PNG",
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/gif": (b"GIF87a", b"GIF89a"),
    "image/webp": b"RIFF",  # + check "WEBP" at offset 8
}
```

Compare the first N bytes of `data` against the expected magic for the declared `content_type`. Reject on mismatch.

---

## Step 4: HubService — Image Serve Method

File: `backend/app/services/hub_service.py`

Add method:

```python
async def get_editor_image(self, storage_file_id: str) -> tuple[Path, str]:
    """Look up an editor image by storage UUID. Returns (file_path, content_type)."""
```

Logic:
1. Query `UserFile` where `file_id=storage_file_id`, `source="editor_image"`, `status IN ("pending", "active")`
2. Not found or expired -> raise 404
3. Validate `content_type in ALLOWED_IMAGE_TYPES` (defense in depth)
4. `fs.get_path(storage_file_id)` -> return `(path, uf.content_type)`

---

## Step 5: HubService — Save-time GC

File: `backend/app/services/hub_service.py`

Modify `save_markdown_content()` — add GC after successful content write:

```python
async def _gc_editor_images(self, doc_id: int, user_id: int, content: str) -> None:
    """Delete unreferenced editor images, confirm referenced ones."""
```

Logic:
1. Regex: extract all `/api/hub/images/([a-f0-9]{32})` from content -> `referenced_ids: set[str]`
   - Pattern matches both `![...](url)` and `<img src="url">` formats (Crepe uses standard `![caption](url)` but defense-in-depth for any future format)
2. Query all `UserFile` where `parent_file_id = doc_id`, `source="editor_image"`, `status IN ("pending", "active")`
3. For each image:
   - If `file_id in referenced_ids`:
     - Set `status = "active"`
     - Sync `expires_at` with parent doc (NULL if parent is NULL)
   - Else:
     - `fs.delete(file_id)`
     - Set `status = "deleted"`

Call `_gc_editor_images(file_id, user_id, content)` inside `save_markdown_content()` after the `overwrite_bytes` call, before commit.

---

## Step 6: HubService — Parent Lifecycle Sync

### 6a: Extend file

File: `backend/app/services/hub_service.py`

In `extend_file()`, after updating the parent doc's `expires_at`:
- Query all `UserFile` where `parent_file_id = doc_id`, `source="editor_image"`, `status="active"`
- Update their `expires_at` to match the new parent value

### 6b: Delete files

In `delete_files()`, for each deleted file:
- Query child images where `parent_file_id = <deleted file's id>`, `source="editor_image"`, `status IN ("pending", "active")`
- Delete each: `fs.delete()` + set `status="deleted"`

This runs unconditionally for every deleted file — the query simply returns nothing if the file has no child images.

---

## Step 7: Backend Endpoints

File: `backend/app/routers/hub.py`

### 7a: `POST /api/hub/files/{id}/images`

```python
@router.post("/files/{id}/images")
@limiter.limit("20/minute")
async def upload_editor_image(
    request: Request,
    id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_verified_user),
    db: AsyncSession = Depends(get_db),
):
```

- Read file bytes, validate content_type against `ALLOWED_IMAGE_TYPES` and size on the route level too
- Call `hub.upload_editor_image(id, user.id, ...)`
- Return `{"file_id": ..., "url": ...}`

### 7b: `GET /api/hub/images/{file_id}`

```python
@router.get("/images/{file_id}")
@limiter.limit("200/minute")
async def serve_editor_image(
    request: Request,
    file_id: str,
    db: AsyncSession = Depends(get_db),
):
```

- No auth required
- Rate limit per IP (200/min — high enough for pages with many images + refreshes)
- Validate `file_id` format: `^[a-f0-9]{32}$`
- Call `hub.get_editor_image(file_id)`
- Return `FileResponse` with `Content-Type`, `Cache-Control: public, max-age=86400`, `X-Content-Type-Options: nosniff`

---

## Step 8: Frontend — Image Compression Utility

File: `frontend/src/utils/imageCompress.ts` (new file)

```typescript
export async function compressImage(
  file: File,
  maxWidth = 1920,
  maxHeight = 1920,
  quality = 0.85,
): Promise<File> {
  // Skip non-compressible formats (GIF for animation)
  if (file.type === 'image/gif') return file
  // Skip small images (< 200KB)
  if (file.size < 200 * 1024) return file

  const bitmap = await createImageBitmap(file)
  const { width, height } = bitmap

  // Skip if already within bounds
  if (width <= maxWidth && height <= maxHeight) {
    bitmap.close()
    return file
  }

  const scale = Math.min(maxWidth / width, maxHeight / height)
  const canvas = new OffscreenCanvas(
    Math.round(width * scale),
    Math.round(height * scale),
  )
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const outputType = file.type === 'image/png' ? 'image/png' : 'image/webp'
  const blob = await canvas.convertToBlob({ type: outputType, quality })
  return new File([blob], file.name, { type: outputType })
}
```

Key decisions:
- Max dimension 1920px (covers most editor widths at 2x retina)
- JPEG/WebP inputs -> WebP output (smaller); PNG stays PNG (preserve transparency)
- GIF skipped (preserve animation)
- Images < 200KB skipped (compression overhead not worth it)
- Uses `OffscreenCanvas` + `createImageBitmap` — no DOM manipulation needed

---

## Step 9: Frontend API

File: `frontend/src/services/hubApi.ts`

Add:

```typescript
export async function uploadEditorImage(
  docId: number,
  file: File,
): Promise<{ file_id: string; url: string }> {
  const form = new FormData()
  form.append('file', file)
  const res = await api.post(`/hub/files/${docId}/images`, form)
  return res.data
}
```

---

## Step 10: Frontend — Enable ImageBlock in TyporaEditor

File: `frontend/src/components/editor/TyporaEditor.tsx`

Changes:
1. Add `onImageUpload?: (file: File) => Promise<string>` to Props
2. Change `[CrepeFeature.ImageBlock]: false` -> remove the `false` (enable it)
3. Add Crepe feature config:
   ```typescript
   [CrepeFeature.ImageBlock]: {
     onUpload: async (file: File) => onImageUploadRef.current?.(file) ?? '',
   },
   ```
4. Store `onImageUpload` in a ref (same pattern as `onChangeRef`)
5. Add CSS import: `import '@milkdown/crepe/theme/common/image-block.css'`

---

## Step 11: Frontend — Enable ImageBlock in MilkdownPreview

File: `frontend/src/components/editor/MilkdownPreview.tsx`

- Enable `ImageBlock` feature (so images render in preview/share pages)
- Add CSS import: `import '@milkdown/crepe/theme/common/image-block.css'`

---

## Step 12: Frontend — DocEditorPage Image Upload Handler

File: `frontend/src/pages/Docs/DocEditorPage.tsx`

Add upload tracking and `handleImageUpload` callback:

```typescript
const pendingUploadsRef = useRef(0)

const handleImageUpload = useCallback(async (file: File): Promise<string> => {
  // 1. Type whitelist
  const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
  if (!ALLOWED_TYPES.includes(file.type)) {
    toast.error(t('imageNotImage'))
    return ''
  }
  // 2. Size check (pre-compression)
  if (file.size > 5 * 1024 * 1024) {
    toast.error(t('imageTooLarge'))
    return ''
  }
  // 3. Compress
  const compressed = await compressImage(file)
  // 4. Upload with tracking
  pendingUploadsRef.current++
  try {
    const { url } = await uploadEditorImage(fileId, compressed)
    return url
  } catch (err) {
    toast.error(t('imageUploadFailed'))
    return ''
  } finally {
    pendingUploadsRef.current--
  }
}, [fileId, t])
```

Modify `handleSave` to wait for pending uploads:

```typescript
const handleSave = useCallback(async () => {
  // Wait for any in-progress image uploads to finish
  if (pendingUploadsRef.current > 0) {
    // Brief wait — uploads are typically fast; if still pending after 10s, save anyway
    // (GC will clean up on next save if the URL wasn't inserted yet)
    await new Promise<void>(resolve => {
      const check = () => {
        if (pendingUploadsRef.current === 0) return resolve()
        setTimeout(check, 200)
      }
      check()
      setTimeout(resolve, 10_000) // safety timeout
    })
  }
  // ... existing save logic
}, [...])
```

Pass `onImageUpload={handleImageUpload}` to `<TyporaEditor>`.

---

## Step 13: i18n Keys

Files:
- `frontend/public/locales/en/docs.json`
- `frontend/public/locales/zh-CN/docs.json`

Add keys:
- `imageNotImage`: "Only PNG, JPEG, GIF, and WebP images are supported" / "仅支持 PNG、JPEG、GIF、WebP 格式的图片"
- `imageTooLarge`: "Image must be smaller than 5 MB" / "图片大小不能超过 5 MB"
- `imageUploadFailed`: "Image upload failed" / "图片上传失败"

---

## Step 14: Testing

### Backend tests
- Upload image -> returns file_id and url
- Upload non-image (e.g. text/plain) -> 400
- Upload SVG -> 400 (not in whitelist)
- Upload image with mismatched magic bytes (e.g. .exe renamed to .jpg) -> 400
- Upload > 5MB -> 413
- Upload when quota exceeded -> 413
- Serve image by UUID -> 200 with correct content-type
- Serve non-existent UUID -> 404
- Save-time GC: upload 2 images, reference 1 in markdown, save -> unreferenced image deleted
- Pending expiration: upload image, don't save -> check 24h expiry set
- Delete parent doc -> child images cascade deleted (via parent_file_id)
- Extend parent doc -> child images expiration updated

### Frontend tests
- Paste image -> compress -> upload called -> URL inserted in editor
- Paste non-image -> toast error, no upload
- Paste > 5MB image -> toast error, no upload
- Upload failure -> toast error, insertion cancelled
- Images render in preview mode
- Save waits for pending uploads to complete
- Large image (3000x2000) is compressed before upload

---

## Execution Order

| Order | Steps | Description |
|-------|-------|-------------|
| 1 | 1-2 | Config + model prep + migration |
| 2 | 3-6 | Service layer: upload (with magic bytes check), serve, GC, lifecycle |
| 3 | 7 | Router endpoints |
| 4 | 8 | Frontend image compression utility |
| 5 | 9-12 | Frontend: API, editor, preview, page handler |
| 6 | 13 | i18n |
| 7 | 14 | Testing |

Steps 3-6 are the core complexity. Step 5 (save-time GC) is the most critical — it prevents orphan images. Step 8 (compression) is self-contained and can be tested independently.
