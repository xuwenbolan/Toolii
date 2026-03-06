import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import {
  CalendarPlus,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileIcon,
  FolderOpen,
  Link2,
  Loader2,
  PackageOpen,
  Pencil,
  Share2,
  Trash2,
  UploadCloud,
} from 'lucide-react'

import { SEOHead } from '@/components/common/SEOHead'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatBytes } from '@/lib/fileValidation'
import {
  buildFileDownloadUrl,
  createShare,
  deleteFiles,
  deleteShare,
  extendFile,
  listFiles,
  listShares,
  renameFile,
  uploadFiles,
  type ShareGroupListItem,
  type ShareGroupResponse,
  type UserFileItem,
} from '@/services/hubApi'

const PAGE_SIZE = 20

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
  const [error, setError] = useState<string | null>(null)

  const handleFiles = useCallback(async (files: File[]) => {
    if (files.length === 0 || pending) return
    setPending(true)
    setError(null)
    setProgress(0)
    try {
      await uploadFiles(files, 7, setProgress)
      onUploaded()
    } catch {
      setError(t('uploadFailed'))
    } finally {
      setPending(false)
    }
  }, [pending, onUploaded, t])

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

// ── Share popover for a single file ─────────────────────────

function SharePopover({
  item,
  onShared,
}: {
  item: UserFileItem
  onShared: () => void
}) {
  const { t } = useTranslation('hub')
  const [open, setOpen] = useState(false)
  const [useCode, setUseCode] = useState(false)
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<ShareGroupResponse | null>(null)
  const [copied, setCopied] = useState(false)

  const handleCreate = async () => {
    if (pending) return
    setPending(true)
    try {
      const res = await createShare({ fileIds: [item.id], useExtractCode: useCode })
      setResult(res)
      onShared()
    } catch {
      // silent
    } finally {
      setPending(false)
    }
  }

  const handleCopy = async () => {
    if (!result) return
    const url = `${window.location.origin}${result.share_url}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      // Reset state when closing
      setResult(null)
      setUseCode(false)
      setCopied(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
          <Share2 className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80"
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
        {result ? (
          // Share created — show link
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{t('shareResult')}</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {`${window.location.origin}${result.share_url}`}
              </span>
              <Button size="sm" variant="outline" className="h-7 shrink-0 px-2 text-xs" onClick={() => { void handleCopy() }}>
                {copied ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}
                {copied ? t('copied') : t('copyLink')}
              </Button>
            </div>
            {result.extract_code ? (
              <p className="text-xs text-muted-foreground">
                {t('extractCode', { code: result.extract_code })}
              </p>
            ) : null}
          </div>
        ) : (
          // Share config — before creating
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Share2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t('shareTitle')}</span>
            </div>
            <p className="text-xs text-muted-foreground">{t('shareDesc')}</p>
            <div className="flex items-center justify-between">
              <label className="text-sm" htmlFor={`code-switch-${item.id}`}>
                {t('shareExtractCode')}
              </label>
              <Switch
                id={`code-switch-${item.id}`}
                checked={useCode}
                onCheckedChange={setUseCode}
              />
            </div>
            <Button
              size="sm"
              className="w-full"
              disabled={pending}
              onClick={() => { void handleCreate() }}
            >
              {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1.5 h-3.5 w-3.5" />}
              {t('shareCreate')}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

// ── File action buttons ─────────────────────────────────────

function FileActions({
  item,
  onRename,
  onExtend,
  onDownload,
  onShared,
}: {
  item: UserFileItem
  onRename: () => void
  onExtend: () => void
  onDownload: () => void
  onShared: () => void
}) {
  return (
    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      <SharePopover item={item} onShared={onShared} />
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

// ── Shares tab content ──────────────────────────────────────

function SharesTab() {
  const { t: tHub } = useTranslation('hub')
  const { t, i18n } = useTranslation('transfer')
  const [items, setItems] = useState<ShareGroupListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ShareGroupListItem | null>(null)

  const fetchList = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await listShares({ page, pageSize: PAGE_SIZE })
      setItems(res.items)
      setTotal(res.total)
    } catch {
      setLoadError(t('list.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [page, t])

  useEffect(() => {
    void fetchList()
  }, [fetchList])

  const handleCopy = useCallback(async (token: string) => {
    const url = `${window.location.origin}/t/${token}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedToken(token)
      setTimeout(() => setCopiedToken(null), 2000)
    } catch {
      // clipboard not available
    }
  }, [])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await deleteShare(deleteTarget.id)
      setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id))
      setTotal((prev) => prev - 1)
    } catch {
      // silent
    } finally {
      setDeleteTarget(null)
    }
  }, [deleteTarget])

  const statusBadge = (status: string) => {
    if (status === 'active')
      return <Badge variant="outline" className="border-success/30 text-success">{t('list.statusActive')}</Badge>
    if (status === 'expired')
      return <Badge variant="outline" className="border-warning/30 text-warning">{t('list.statusExpired')}</Badge>
    return <Badge variant="outline" className="text-muted-foreground">{t('list.statusDeleted')}</Badge>
  }

  const offset = (page - 1) * PAGE_SIZE

  return (
    <>
      <div className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">{tHub('loading')}</p>
        ) : loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <PackageOpen className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">{t('list.empty')}</p>
          </div>
        ) : (
          <>
            {items.map((item) => (
              <Card key={item.id} className="border-border/70 shadow-sm">
                <CardContent className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {statusBadge(item.status)}
                      <span className="text-xs text-muted-foreground">
                        {t('list.files', { count: item.file_count })}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatBytes(item.total_size)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t('list.downloads', { count: item.download_count })}
                      </span>
                      {item.extract_code ? (
                        <span className="text-xs text-muted-foreground">
                          {t('list.extractCode', { code: item.extract_code })}
                        </span>
                      ) : null}
                    </div>
                    {item.expires_at ? (
                      <p className="text-xs text-muted-foreground">
                        {t('list.expires', { date: formatTime(item.expires_at, i18n.language) })}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {item.status === 'active' ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2"
                          onClick={() => { void handleCopy(item.token) }}
                        >
                          {copiedToken === item.token ? (
                            <Check className="mr-1 h-3.5 w-3.5" />
                          ) : (
                            <Copy className="mr-1 h-3.5 w-3.5" />
                          )}
                          {copiedToken === item.token ? t('list.copied') : t('list.copyLink')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 px-0"
                          asChild
                        >
                          <a href={`/t/${item.token}`} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      </>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 px-0 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(item)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
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
                    {tHub('previous')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={offset + PAGE_SIZE >= total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {tHub('next')}
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null) }}
        title={t('list.deleteConfirmTitle')}
        description={t('list.deleteConfirmDesc')}
        confirmLabel={t('list.delete')}
        cancelLabel={tHub('cancel')}
        variant="destructive"
        onConfirm={() => { void handleDeleteConfirm() }}
      />
    </>
  )
}

// ── Main page ───────────────────────────────────────────────

export function HubFilesPage() {
  const { t, i18n } = useTranslation('hub')
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') === 'shares' ? 'shares' : 'files'

  // Files state
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

  const handleTabChange = useCallback((value: string) => {
    setSearchParams(value === 'shares' ? { tab: 'shares' } : {}, { replace: true })
  }, [setSearchParams])

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

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="files">{t('tabFiles')}</TabsTrigger>
            <TabsTrigger value="shares">{t('tabShares')}</TabsTrigger>
          </TabsList>

          {/* ── Files tab ── */}
          <TabsContent value="files">
            <div className="space-y-4 pt-1">
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
                          onRename={() => setRenameItem(item)}
                          onExtend={() => setExtendItem(item)}
                          onDownload={() => handleDownload(item.id, item.file_name)}
                          onShared={() => { void fetchList() }}
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
          </TabsContent>

          {/* ── Shares tab ── */}
          <TabsContent value="shares">
            <div className="pt-1">
              <SharesTab />
            </div>
          </TabsContent>
        </Tabs>
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
    </>
  )
}
