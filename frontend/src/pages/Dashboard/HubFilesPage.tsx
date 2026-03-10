import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import {
  ChevronDown,
  FolderOpen,
  LayoutGrid,
  List,
  Loader2,
  Share2,
  SquarePen,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import { toast } from 'sonner'

import { SEOHead } from '@/components/common/SEOHead'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatBytes } from '@/lib/fileValidation'
import { getTranslatedApiError } from '@/lib/apiErrors'
import { useFileDownload } from '@/hooks/useFileDownload'
import {
  buildFileDownloadUrl,
  deleteFiles,
  listFiles,
  uploadFiles,
  type UserFileItem,
} from '@/services/hubApi'

import { SimplePagination } from '@/components/common/SimplePagination'
import { ExtendDialog } from './hub/ExtendDialog'
import { FileGridView } from './hub/FileGridView'
import { FileListView } from './hub/FileListView'
import { RenameDialog } from './hub/RenameDialog'
import { ShareDialog } from './hub/ShareDialog'
import { SharesTab } from './hub/SharesTab'
import { UploadOverlay } from './hub/UploadOverlay'

const PAGE_SIZE = 20
const SOURCE_FILTERS = ['all', 'upload', 'tool'] as const
type ViewMode = 'list' | 'grid'

function getInitialViewMode(): ViewMode {
  try {
    const saved = localStorage.getItem('hub-view-mode')
    if (saved === 'grid') return 'grid'
  } catch { /* ignore */ }
  return 'list'
}

// ── Main page ───────────────────────────────────────────────

export function HubFilesPage() {
  const { t } = useTranslation('hub')
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') === 'shares' ? 'shares' : 'files'

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode)
  const handleViewMode = (mode: ViewMode) => {
    setViewMode(mode)
    try { localStorage.setItem('hub-view-mode', mode) } catch { /* ignore */ }
  }

  // Files state
  const [items, setItems] = useState<UserFileItem[]>([])
  const [total, setTotal] = useState(0)
  const [usedBytes, setUsedBytes] = useState(0)
  const [quotaBytes, setQuotaBytes] = useState(0)
  const [fileCount, setFileCount] = useState(0)
  const [maxFiles, setMaxFiles] = useState(0)
  const [maxRetentionDays, setMaxRetentionDays] = useState(0)
  const [page, setPage] = useState(1)
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [deleteOpen, setDeleteOpen] = useState(false)

  // Upload state
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  // Action dialogs
  const [renameItem, setRenameItem] = useState<UserFileItem | null>(null)
  const [extendItem, setExtendItem] = useState<UserFileItem | null>(null)
  const [shareFileIds, setShareFileIds] = useState<number[]>([])
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [deleteItem, setDeleteItem] = useState<UserFileItem | null>(null)
  const download = useFileDownload()

  // ── Data fetching ──

  const openDocument = useCallback((item: UserFileItem) => {
    navigate(`/doc/edit/${item.id}`)
  }, [navigate])

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
      setFileCount(res.file_count)
      setMaxFiles(res.max_files)
      setMaxRetentionDays(res.max_retention_days)
    } catch {
      setLoadError(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [page, sourceFilter, t])

  useEffect(() => {
    void fetchList()
  }, [fetchList])

  // ── Upload (page-level dropzone) ──

  const handleUpload = useCallback(async (files: File[]) => {
    if (files.length === 0 || uploading) return
    setUploading(true)
    setUploadProgress(0)
    try {
      await uploadFiles(files, 7, setUploadProgress)
      toast.success(t('uploadSuccess', { count: files.length }))
      if (page === 1) {
        void fetchList()
      } else {
        setPage(1)
      }
    } catch (err) {
      toast.error(getTranslatedApiError(err, t('uploadFailed')))
    } finally {
      setUploading(false)
    }
  }, [uploading, fetchList, t])

  const { getRootProps, getInputProps, isDragActive, open: openFilePicker } = useDropzone({
    onDrop: handleUpload,
    multiple: true,
    maxFiles: 20,
    noClick: true,
    noKeyboard: true,
    disabled: uploading,
  })

  // ── Selection ──

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

  // ── Actions ──

  const handleDelete = useCallback(async () => {
    const ids = deleteItem ? [deleteItem.id] : [...selected]
    if (ids.length === 0) return
    try {
      await deleteFiles(ids)
      setSelected(new Set())
      setDeleteItem(null)
      void fetchList()
    } catch {
      // silent
    } finally {
      setDeleteOpen(false)
    }
  }, [selected, deleteItem, fetchList])

  const handleDownload = useCallback((item: UserFileItem) => {
    return download(buildFileDownloadUrl(item.id), item.file_name)
  }, [download])

  const handleShare = useCallback((item: UserFileItem) => {
    setShareFileIds([item.id])
    setShareDialogOpen(true)
  }, [])

  const handleBatchShare = useCallback(() => {
    setShareFileIds([...selected])
    setShareDialogOpen(true)
  }, [selected])

  const handleSingleDelete = useCallback((item: UserFileItem) => {
    setDeleteItem(item)
    setDeleteOpen(true)
  }, [])

  const handleBatchDelete = useCallback(() => {
    setDeleteItem(null)
    setDeleteOpen(true)
  }, [])

  const handleTabChange = useCallback((value: string) => {
    setSearchParams(value === 'shares' ? { tab: 'shares' } : {}, { replace: true })
  }, [setSearchParams])

  const handleCreateDocument = useCallback(async () => {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
    const file = new File([''], `untitled-${stamp}.md`, { type: 'text/markdown' })
    try {
      const res = await uploadFiles([file], 7)
      const created = res.files[0]
      if (created) navigate(`/doc/edit/${created.id}`)
    } catch (err) {
      toast.error(getTranslatedApiError(err, t('createDocFailed')))
    }
  }, [navigate, t])

  const usagePercent = quotaBytes > 0 ? Math.min((usedBytes / quotaBytes) * 100, 100) : 0
  const deleteCount = deleteItem ? 1 : selected.size

  return (
    <>
      <SEOHead title={t('title')} noindex />

      <div {...getRootProps()} className="space-y-5">
        <input {...getInputProps()} />

        {/* Drag overlay */}
        {isDragActive && <UploadOverlay />}

        {/* Header */}
        <Collapsible className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
              <div className="flex items-center gap-1.5">
                <span className="text-sm tabular-nums text-muted-foreground">
                  {quotaBytes > 0
                    ? `${formatBytes(usedBytes)} / ${formatBytes(quotaBytes)}`
                    : `${formatBytes(usedBytes)} ${t('used')}`}
                </span>
                {quotaBytes > 0 && usagePercent > 90 && (
                  <Badge variant="outline" className="border-destructive/30 text-destructive text-xs">
                    {t('storageAlmostFull')}
                  </Badge>
                )}
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <ChevronDown className="h-3.5 w-3.5 transition-transform duration-[var(--duration-fast)] [[data-state=open]_&]:rotate-180" />
                  </Button>
                </CollapsibleTrigger>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={openFilePicker} disabled={uploading}>
                {uploading ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <UploadCloud className="mr-1 h-3.5 w-3.5" />
                )}
                {t('upload')}
              </Button>
              <Button size="sm" onClick={() => { void handleCreateDocument() }}>
                <SquarePen className="mr-1 h-3.5 w-3.5" />
                {t('createDoc')}
              </Button>
            </div>
          </div>

          <CollapsibleContent>
            <div className="grid grid-cols-3 divide-x divide-border/60 rounded-lg border border-border/70">
              <div className="space-y-1.5 px-3 py-2.5">
                <p className="tabular-nums">
                  <span className="text-base font-semibold text-foreground">{formatBytes(usedBytes)}</span>
                  <span className="text-xs text-muted-foreground">
                    {quotaBytes > 0 ? ` / ${formatBytes(quotaBytes)}` : ` ${t('used')}`}
                  </span>
                </p>
                {quotaBytes > 0 && (
                  <Progress
                    value={usagePercent}
                    className={`h-1 ${usagePercent > 90 ? '[&>[data-slot=indicator]]:bg-destructive' : ''}`}
                  />
                )}
                <p className="text-xs text-muted-foreground">{t('quotaStorage')}</p>
              </div>
              <div className="space-y-1.5 px-3 py-2.5">
                <p className="tabular-nums">
                  <span className="text-base font-semibold text-foreground">{fileCount}</span>
                  <span className="text-xs text-muted-foreground">
                    {maxFiles > 0 ? ` / ${maxFiles}` : ` ${t('quotaFilesUnit')}`}
                  </span>
                </p>
                {maxFiles > 0 && (
                  <Progress
                    value={Math.min((fileCount / maxFiles) * 100, 100)}
                    className={`h-1 ${fileCount / maxFiles > 0.9 ? '[&>[data-slot=indicator]]:bg-destructive' : ''}`}
                  />
                )}
                <p className="text-xs text-muted-foreground">{t('quotaFiles')}</p>
              </div>
              <div className="space-y-1.5 px-3 py-2.5">
                <p className="text-base font-semibold text-foreground">
                  {maxRetentionDays === 0 ? t('unlimited') : t('retentionDays', { days: maxRetentionDays })}
                </p>
                <p className="text-xs text-muted-foreground">{t('quotaRetention')}</p>
              </div>
            </div>
          </CollapsibleContent>

          {/* Upload progress */}
          {uploading && (
            <Progress value={uploadProgress} className="h-1.5" />
          )}
        </Collapsible>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="files">{t('tabFiles')}</TabsTrigger>
            <TabsTrigger value="shares">{t('tabShares')}</TabsTrigger>
          </TabsList>

          {/* ── Files tab ── */}
          <TabsContent value="files">
            <div className="space-y-4 pt-1">
              {/* Filter bar + view toggle */}
              <div className="flex items-center justify-between gap-2">
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
                <div className="flex items-center rounded-md border border-border/70">
                  <Button
                    size="icon"
                    variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                    className="h-8 w-8 rounded-r-none"
                    onClick={() => handleViewMode('list')}
                    aria-label={t('viewList')}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                    className="h-8 w-8 rounded-l-none"
                    onClick={() => handleViewMode('grid')}
                    aria-label={t('viewGrid')}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Bulk actions (rendered outside flow, at page bottom) */}

              {/* File list / grid */}
              {loading ? (
                viewMode === 'list' ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full rounded-lg" />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="aspect-[4/3] w-full rounded-xl" />
                    ))}
                  </div>
                )
              ) : loadError ? (
                <p className="text-sm text-destructive">{loadError}</p>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-16 text-center">
                  <FolderOpen className="h-12 w-12 text-muted-foreground/40" />
                  <div className="space-y-1">
                    <p className="text-base font-medium text-muted-foreground">{t('empty')}</p>
                    <p className="text-xs text-muted-foreground">{t('emptyHint')}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={openFilePicker}>
                    <UploadCloud className="mr-1 h-3.5 w-3.5" />
                    {t('upload')}
                  </Button>
                </div>
              ) : viewMode === 'list' ? (
                <FileListView
                  items={items}
                  selected={selected}
                  onToggleSelect={toggleSelect}
                  onEdit={openDocument}
                  onRename={setRenameItem}
                  onExtend={setExtendItem}
                  onShare={handleShare}
                  onDownload={handleDownload}
                  onDelete={handleSingleDelete}
                />
              ) : (
                <FileGridView
                  items={items}
                  selected={selected}
                  onToggleSelect={toggleSelect}
                  onEdit={openDocument}
                  onRename={setRenameItem}
                  onExtend={setExtendItem}
                  onShare={handleShare}
                  onDownload={handleDownload}
                  onDelete={handleSingleDelete}
                />
              )}

              <SimplePagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
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

      {/* Floating bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-xl border bg-background/95 px-4 py-2.5 shadow-lg backdrop-blur-sm animate-in fade-in-0 slide-in-from-bottom-2 duration-[var(--duration-normal)]">
          <Checkbox
            checked={selected.size === items.length}
            onCheckedChange={toggleSelectAll}
            aria-label={t('selectAll')}
          />
          <span className="text-sm font-medium">{t('selected', { count: selected.size })}</span>
          <Button size="sm" variant="outline" onClick={handleBatchShare}>
            <Share2 className="mr-1 h-3.5 w-3.5" />
            {t('share')}
          </Button>
          <Button size="sm" variant="destructive" onClick={handleBatchDelete}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            {t('delete')}
          </Button>
        </div>
      )}

      {/* Dialogs */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('deleteConfirmTitle')}
        description={t('deleteConfirmDesc', { count: deleteCount })}
        confirmLabel={t('deleteConfirm')}
        cancelLabel={t('cancel')}
        variant="destructive"
        onConfirm={() => { void handleDelete() }}
      />

      <RenameDialog
        item={renameItem}
        onClose={() => setRenameItem(null)}
        onDone={() => { void fetchList() }}
      />

      <ExtendDialog
        item={extendItem}
        onClose={() => setExtendItem(null)}
        onDone={() => { void fetchList() }}
      />

      <ShareDialog
        open={shareDialogOpen}
        fileIds={shareFileIds}
        onClose={() => setShareDialogOpen(false)}
        onShared={() => { void fetchList() }}
      />
    </>
  )
}
