import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDropzone } from 'react-dropzone'
import {
  CalendarPlus,
  Check,
  Copy,
  Download,
  FileIcon,
  FolderOpen,
  Link2,
  Loader2,
  Pencil,
  Share2,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'

import { SEOHead } from '@/components/common/SEOHead'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatBytes } from '@/lib/fileValidation'
import {
  buildFileDownloadUrl,
  createShare,
  deleteFiles,
  extendFile,
  listFiles,
  renameFile,
  uploadFiles,
  type ShareGroupResponse,
  type UserFileItem,
} from '@/services/hubApi'

const PAGE_SIZE = 20
const RETENTION_OPTIONS = [1, 3, 7] as const

function formatTime(value: string, locale: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const SOURCE_FILTERS = ['all', 'upload', 'tool'] as const

// ── Upload section ──────────────────────────────────────────

function UploadSection({ onUploaded }: { onUploaded: () => void }) {
  const { t } = useTranslation('hub')
  const [pending, setPending] = useState(false)
  const [progress, setProgress] = useState(0)
  const [retentionDays, setRetentionDays] = useState<number>(3)
  const [error, setError] = useState<string | null>(null)

  const handleFiles = useCallback(async (files: File[]) => {
    if (files.length === 0 || pending) return
    setPending(true)
    setError(null)
    setProgress(0)
    try {
      await uploadFiles(files, retentionDays, setProgress)
      onUploaded()
    } catch {
      setError(t('uploadFailed'))
    } finally {
      setPending(false)
    }
  }, [pending, retentionDays, onUploaded, t])

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: handleFiles,
    multiple: true,
    maxFiles: 20,
    noClick: true,
    noKeyboard: true,
    disabled: pending,
  })

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={[
          'flex min-h-[7rem] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors',
          isDragActive ? 'border-primary/60 bg-accent/40' : 'border-border/60 hover:border-border hover:bg-muted/30',
          pending ? 'pointer-events-none opacity-60' : '',
        ].join(' ')}
        onClick={open}
      >
        <input {...getInputProps()} />
        {pending ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm font-medium">{t('uploading')}</p>
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </>
        ) : (
          <>
            <UploadCloud className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium">{t('uploadDrop')}</p>
            <p className="text-xs text-muted-foreground">{t('uploadHint')}</p>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{t('retentionLabel')}</span>
        {RETENTION_OPTIONS.map((days) => (
          <Button
            key={days}
            type="button"
            size="sm"
            variant={retentionDays === days ? 'default' : 'outline'}
            className="h-7 px-2.5 text-xs"
            onClick={() => setRetentionDays(days)}
          >
            {t('retentionDays', { days })}
          </Button>
        ))}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}

// ── Rename dialog ───────────────────────────────────────────

function RenameDialog({
  item,
  onClose,
  onDone,
}: {
  item: UserFileItem | null
  onClose: () => void
  onDone: () => void
}) {
  const { t } = useTranslation('hub')
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (item) {
      setName(item.file_name)
      setTimeout(() => inputRef.current?.select(), 50)
    }
  }, [item])

  const handleSubmit = async () => {
    if (!item || !name.trim() || pending) return
    setPending(true)
    try {
      await renameFile(item.id, name.trim())
      onDone()
      onClose()
    } catch {
      // silent
    } finally {
      setPending(false)
    }
  }

  if (!item) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="mx-4 w-full max-w-sm space-y-4 rounded-xl bg-background p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold">{t('renameTitle')}</h3>
        <Input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleSubmit() }}
          placeholder={t('renamePlaceholder')}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>{t('cancel')}</Button>
          <Button size="sm" disabled={!name.trim() || pending} onClick={() => { void handleSubmit() }}>
            {t('renameConfirm')}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Extend dialog ───────────────────────────────────────────

function ExtendDialog({
  item,
  onClose,
  onDone,
}: {
  item: UserFileItem | null
  onClose: () => void
  onDone: () => void
}) {
  const { t } = useTranslation('hub')
  const [days, setDays] = useState(3)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (item) { setDays(3); setError(null) }
  }, [item])

  const handleExtend = async () => {
    if (!item || pending) return
    setPending(true)
    setError(null)
    try {
      await extendFile(item.id, days)
      onDone()
      onClose()
    } catch {
      setError(t('extendFailed'))
    } finally {
      setPending(false)
    }
  }

  if (!item) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="mx-4 w-full max-w-sm space-y-4 rounded-xl bg-background p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold">{t('extendTitle')}</h3>
        <div className="flex gap-2">
          {([1, 3, 5] as const).map((d) => (
            <Button
              key={d}
              size="sm"
              variant={days === d ? 'default' : 'outline'}
              onClick={() => setDays(d)}
            >
              {t('retentionDays', { days: d })}
            </Button>
          ))}
        </div>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>{t('cancel')}</Button>
          <Button size="sm" disabled={pending} onClick={() => { void handleExtend() }}>
            {t('extendConfirm')}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Share result dialog ─────────────────────────────────────

function ShareResultDialog({
  result,
  onClose,
}: {
  result: ShareGroupResponse
  onClose: () => void
}) {
  const { t } = useTranslation('hub')
  const [copied, setCopied] = useState(false)

  const shareUrl = `${window.location.origin}${result.share_url}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="mx-4 w-full max-w-md space-y-3 rounded-xl bg-background p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">{t('shareResult')}</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2">
          <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate text-sm">{shareUrl}</span>
          <Button size="sm" variant="outline" className="shrink-0" onClick={() => { void handleCopy() }}>
            {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
            {copied ? t('copied') : t('copyLink')}
          </Button>
        </div>
        {result.extract_code ? (
          <p className="text-sm text-muted-foreground">
            {t('extractCode', { code: result.extract_code })}
          </p>
        ) : null}
      </div>
    </div>
  )
}

// ── File action buttons ─────────────────────────────────────

function FileActions({
  item,
  sharing,
  onRename,
  onExtend,
  onShare,
  onDownload,
}: {
  item: UserFileItem
  sharing: boolean
  onRename: () => void
  onExtend: () => void
  onShare: () => void
  onDownload: () => void
}) {
  return (
    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={onShare} disabled={sharing}>
        {sharing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />}
      </Button>
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={onRename}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={onExtend}>
        <CalendarPlus className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={onDownload}>
        <Download className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

// ── Main page ───────────────────────────────────────────────

export function HubFilesPage() {
  const { t, i18n } = useTranslation('hub')
  const [items, setItems] = useState<UserFileItem[]>([])
  const [total, setTotal] = useState(0)
  const [usedBytes, setUsedBytes] = useState(0)
  const [quotaBytes, setQuotaBytes] = useState(0)
  const [page, setPage] = useState(1)
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [deleteOpen, setDeleteOpen] = useState(false)

  // Action dialogs
  const [renameItem, setRenameItem] = useState<UserFileItem | null>(null)
  const [extendItem, setExtendItem] = useState<UserFileItem | null>(null)
  const [shareResult, setShareResult] = useState<ShareGroupResponse | null>(null)
  const [sharingId, setSharingId] = useState<number | null>(null)

  const fetchList = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await listFiles({
        page,
        pageSize: PAGE_SIZE,
        source: sourceFilter === 'all' ? undefined : sourceFilter,
      })
      setItems(res.items)
      setTotal(res.total)
      setUsedBytes(res.used_bytes)
      setQuotaBytes(res.quota_bytes)
    } catch {
      setLoadError(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [page, sourceFilter, t])

  useEffect(() => {
    void fetchList()
  }, [fetchList])

  const toggleSelect = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    if (selected.size === items.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(items.map((i) => i.id)))
    }
  }, [items, selected.size])

  const handleDelete = useCallback(async () => {
    if (selected.size === 0) return
    try {
      await deleteFiles([...selected])
      setSelected(new Set())
      void fetchList()
    } catch {
      // silent
    } finally {
      setDeleteOpen(false)
    }
  }, [selected, fetchList])

  const handleDownload = useCallback((fileId: number, fileName: string) => {
    const a = document.createElement('a')
    a.href = buildFileDownloadUrl(fileId)
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
  }, [])

  const handleShare = useCallback(async (fileId: number) => {
    if (sharingId) return
    setSharingId(fileId)
    try {
      const res = await createShare({ fileIds: [fileId] })
      setShareResult(res)
    } catch {
      // silent
    } finally {
      setSharingId(null)
    }
  }, [sharingId])

  const offset = (page - 1) * PAGE_SIZE
  const usagePercent = quotaBytes > 0 ? Math.min((usedBytes / quotaBytes) * 100, 100) : 0

  const sourceBadge = (source: string) => {
    if (source === 'upload')
      return <Badge variant="outline" className="text-xs">{t('sourceUpload')}</Badge>
    return <Badge variant="outline" className="text-xs">{t('sourceTool')}</Badge>
  }

  return (
    <>
      <SEOHead title={t('title')} noindex />

      <div className="space-y-5">
        {/* Header + quota bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
            {quotaBytes > 0 ? (
              <span className="text-xs text-muted-foreground">
                {t('usage', { used: formatBytes(usedBytes), quota: formatBytes(quotaBytes) })}
              </span>
            ) : null}
          </div>
          {quotaBytes > 0 ? (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${usagePercent > 90 ? 'bg-destructive' : 'bg-primary'}`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
          ) : null}
        </div>

        {/* Upload area */}
        <UploadSection onUploaded={() => { setPage(1); void fetchList() }} />

        {/* Source filter */}
        <div className="flex items-center gap-2">
          {SOURCE_FILTERS.map((f) => (
            <Button
              key={f}
              size="sm"
              variant={sourceFilter === f ? 'default' : 'outline'}
              onClick={() => { setSourceFilter(f); setPage(1); setSelected(new Set()) }}
            >
              {f === 'all' ? t('allSources') : f === 'upload' ? t('sourceUpload') : t('sourceTool')}
            </Button>
          ))}
        </div>

        {/* Bulk actions */}
        {selected.size > 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-muted/30 px-3 py-2">
            <span className="text-sm font-medium">{t('selected', { count: selected.size })}</span>
            <Button size="sm" variant="ghost" onClick={toggleSelectAll}>
              {selected.size === items.length ? t('deselectAll') : t('selectAll')}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              {t('delete')}
            </Button>
          </div>
        ) : null}

        {/* File list */}
        {loading ? (
          <p className="text-sm text-muted-foreground">{t('loading')}</p>
        ) : loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <FolderOpen className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">{t('empty')}</p>
            <p className="text-xs text-muted-foreground">{t('emptyHint')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <Card
                key={item.id}
                className={`cursor-pointer border-border/70 shadow-sm transition ${selected.has(item.id) ? 'border-primary/50 bg-primary/5' : ''}`}
                onClick={() => toggleSelect(item.id)}
              >
                <CardContent className="flex items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 shrink-0 rounded border-border"
                  />
                  <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.file_name}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {sourceBadge(item.source)}
                      <span>{formatBytes(item.size)}</span>
                      <span>{t('expires', { date: formatTime(item.expires_at, i18n.language) })}</span>
                      {item.share_count > 0 ? (
                        <span>{t('shareCount', { count: item.share_count })}</span>
                      ) : null}
                    </div>
                  </div>
                  <FileActions
                    item={item}
                    sharing={sharingId === item.id}
                    onRename={() => setRenameItem(item)}
                    onExtend={() => setExtendItem(item)}
                    onShare={() => { void handleShare(item.id) }}
                    onDownload={() => handleDownload(item.id, item.file_name)}
                  />
                </CardContent>
              </Card>
            ))}

            {total > PAGE_SIZE ? (
              <div className="flex items-center justify-between pt-2 text-sm">
                <span className="text-muted-foreground">
                  {offset + 1}-{Math.min(offset + PAGE_SIZE, total)} / {total}
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    {t('previous')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={offset + PAGE_SIZE >= total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {t('next')}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('deleteConfirmTitle')}
        description={t('deleteConfirmDesc', { count: selected.size })}
        confirmLabel={t('deleteConfirm')}
        cancelLabel={t('cancel')}
        variant="destructive"
        onConfirm={() => { void handleDelete() }}
      />

      {/* Rename dialog */}
      <RenameDialog
        item={renameItem}
        onClose={() => setRenameItem(null)}
        onDone={() => { void fetchList() }}
      />

      {/* Extend dialog */}
      <ExtendDialog
        item={extendItem}
        onClose={() => setExtendItem(null)}
        onDone={() => { void fetchList() }}
      />

      {/* Share result */}
      {shareResult ? (
        <ShareResultDialog
          result={shareResult}
          onClose={() => setShareResult(null)}
        />
      ) : null}
    </>
  )
}
