import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useDropzone } from 'react-dropzone'
import {
  Clock,
  FolderOpen,
  HardDrive,
  Hash,
  Infinity,
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
import { Progress } from '@/components/ui/progress'
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
    void download(buildFileDownloadUrl(item.id), item.file_name)
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

  const offset = (page - 1) * PAGE_SIZE
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
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
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

          {/* Upload progress */}
          {uploading && (
            <Progress value={uploadProgress} className="h-1.5" />
          )}

          {/* Quota stats */}
          <div className="grid grid-cols-3 gap-3">
            {/* Storage */}
            <div className="space-y-2 rounded-lg border border-border/70 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <HardDrive className="h-3.5 w-3.5" />
                {t('quotaStorage')}
              </div>
              {quotaBytes > 0 ? (
                <>
                  <Progress
                    value={usagePercent}
                    className={`h-1.5 ${usagePercent > 90 ? '[&>[data-slot=indicator]]:bg-destructive' : ''}`}
                  />
                  <p className="text-xs tabular-nums">
                    <span className="text-sm font-medium text-foreground">{formatBytes(usedBytes)}</span>
                    <span className="text-muted-foreground"> / {formatBytes(quotaBytes)}</span>
                  </p>
                </>
              ) : (
                <p className="flex items-center gap-1 text-xs">
                  <Infinity className="h-3.5 w-3.5 text-muted-foreground/60" />
                  <span className="text-sm font-medium text-foreground">{formatBytes(usedBytes)}</span>
                  <span className="text-muted-foreground">{t('used')}</span>
                </p>
              )}
            </div>

            {/* File count */}
            <div className="space-y-2 rounded-lg border border-border/70 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Hash className="h-3.5 w-3.5" />
                {t('quotaFiles')}
              </div>
              {maxFiles > 0 ? (
                <>
                  <Progress
                    value={Math.min((fileCount / maxFiles) * 100, 100)}
                    className={`h-1.5 ${fileCount / maxFiles > 0.9 ? '[&>[data-slot=indicator]]:bg-destructive' : ''}`}
                  />
                  <p className="text-xs tabular-nums">
                    <span className="text-sm font-medium text-foreground">{fileCount}</span>
                    <span className="text-muted-foreground"> / {maxFiles}</span>
                  </p>
                </>
              ) : (
                <p className="flex items-center gap-1 text-xs">
                  <Infinity className="h-3.5 w-3.5 text-muted-foreground/60" />
                  <span className="text-sm font-medium text-foreground">{fileCount}</span>
                  <span className="text-muted-foreground">{t('quotaFilesUnit')}</span>
                </p>
              )}
            </div>

            {/* Retention */}
            <div className="space-y-2 rounded-lg border border-border/70 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {t('quotaRetention')}
              </div>
              <p className="flex items-center gap-1 text-xs">
                {maxRetentionDays === 0 ? (
                  <>
                    <Infinity className="h-3.5 w-3.5 text-muted-foreground/60" />
                    <span className="text-sm font-medium text-foreground">{t('unlimited')}</span>
                  </>
                ) : (
                  <span className="text-sm font-medium text-foreground">
                    {t('retentionDays', { days: maxRetentionDays })}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Storage almost full warning */}
          {quotaBytes > 0 && usagePercent > 90 && (
            <Badge variant="outline" className="border-destructive/30 text-destructive">
              {t('storageAlmostFull')}
            </Badge>
          )}
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
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                    className="h-8 w-8"
                    onClick={() => handleViewMode('list')}
                    aria-label={t('viewList')}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant={viewMode === 'grid' ? 'default' : 'ghost'}
                    className="h-8 w-8"
                    onClick={() => handleViewMode('grid')}
                    aria-label={t('viewGrid')}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Bulk actions */}
              {selected.size > 0 && (
                <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-muted/30 px-3 py-2">
                  <Checkbox
                    checked={selected.size === items.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label={t('selectAll')}
                  />
                  <span className="text-sm font-medium">{t('selected', { count: selected.size })}</span>
                  <div className="flex-1" />
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

              {/* File list / grid */}
              {loading ? (
                <p className="text-sm text-muted-foreground">{t('loading')}</p>
              ) : loadError ? (
                <p className="text-sm text-destructive">{loadError}</p>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <FolderOpen className="h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">{t('empty')}</p>
                  <p className="text-xs text-muted-foreground">{t('emptyHint')}</p>
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

              {/* Pagination */}
              {total > PAGE_SIZE && (
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
