import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Loader2,
  PackageOpen,
  Plus,
  Share2,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'

import { SimplePagination } from '@/components/common/SimplePagination'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBytes } from '@/lib/fileValidation'
import {
  addFilesToShare,
  deleteShare,
  getShareInfo,
  listFiles,
  listShares,
  removeFilesFromShare,
  type ShareFileItem,
  type ShareGroupListItem,
  type ShareInfoResponse,
  type UserFileItem,
} from '@/services/hubApi'

import { getFileTypeIcon } from './fileTypeIcons'
import { formatTime } from './utils'

const PAGE_SIZE = 20

// ── Add-files dialog ───────────────────────────────────────────────

function AddFilesDialog({
  open,
  shareId,
  existingFileIds,
  onClose,
  onAdded,
}: {
  open: boolean
  shareId: number
  existingFileIds: Set<number>
  onClose: () => void
  onAdded: () => void
}) {
  const { t } = useTranslation('hub')
  const [availableFiles, setAvailableFiles] = useState<UserFileItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    setSelected(new Set())
    setLoading(true)
    listFiles({ page: 1, pageSize: 100 })
      .then((res) => {
        setAvailableFiles(res.items.filter((f) => !existingFileIds.has(f.id)))
      })
      .catch(() => {
        setAvailableFiles([])
      })
      .finally(() => setLoading(false))
  }, [open, existingFileIds])

  const toggleFile = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSubmit = async () => {
    if (selected.size === 0 || submitting) return
    setSubmitting(true)
    try {
      await addFilesToShare(shareId, [...selected])
      toast.success(t('addFilesSuccess', { count: selected.size }))
      onAdded()
      onClose()
    } catch {
      toast.error(t('addFilesFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('addFilesTitle')}</DialogTitle>
          <DialogDescription>{t('addFilesDesc')}</DialogDescription>
        </DialogHeader>

        <div className="max-h-64 space-y-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : availableFiles.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t('noFilesAvailable')}
            </p>
          ) : (
            availableFiles.map((f) => {
              const FileIcon = getFileTypeIcon(f.content_type)
              return (
                <label
                  key={f.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selected.has(f.id)}
                    onCheckedChange={() => toggleFile(f.id)}
                  />
                  <FileIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm">{f.file_name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatBytes(f.size)}
                  </span>
                </label>
              )
            })
          )}
        </div>

        <DialogFooter>
          <Button
            className="w-full"
            disabled={selected.size === 0 || submitting}
            onClick={() => { void handleSubmit() }}
          >
            {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {t('addFilesConfirm')}
            {selected.size > 0 && ` (${selected.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Share item ──────────────────────────────────────────────────────

function ShareItem({
  item,
  onDelete,
  onUpdate,
}: {
  item: ShareGroupListItem
  onDelete: () => void
  onUpdate: () => void
}) {
  const { t: tHub } = useTranslation('hub')
  const { t, i18n } = useTranslation('transfer')
  const [copiedToken, setCopiedToken] = useState(false)
  const [files, setFiles] = useState<ShareFileItem[] | null>(null)
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [removingFileId, setRemovingFileId] = useState<number | null>(null)
  const [removeConfirmFileId, setRemoveConfirmFileId] = useState<number | null>(null)

  const shareUrl = `${window.location.origin}/t/${item.token}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopiedToken(true)
      setTimeout(() => setCopiedToken(false), 2000)
    } catch {
      toast.error(tHub('copyLink'))
    }
  }

  const handleNativeShare = async () => {
    try {
      await navigator.share({
        url: shareUrl,
        title: item.message || undefined,
      })
    } catch {
      // user cancelled — not an error
    }
  }

  const fetchFiles = useCallback(async () => {
    setLoadingFiles(true)
    try {
      const info = await getShareInfo(item.token, item.extract_code ?? undefined)
      if ('files' in info) {
        setFiles((info as ShareInfoResponse).files)
      }
    } catch {
      setFiles(null)
    } finally {
      setLoadingFiles(false)
    }
  }, [item.token, item.extract_code])

  const handleOpenChange = useCallback(
    async (open: boolean) => {
      if (!open || files !== null || loadingFiles) return
      await fetchFiles()
    },
    [files, loadingFiles, fetchFiles],
  )

  const handleRemoveFile = useCallback(async () => {
    if (removeConfirmFileId === null) return
    setRemovingFileId(removeConfirmFileId)
    setRemoveConfirmFileId(null)
    try {
      await removeFilesFromShare(item.id, [removeConfirmFileId])
      setFiles((prev) => prev?.filter((f) => f.id !== removeConfirmFileId) ?? null)
      onUpdate()
    } catch {
      toast.error(tHub('removeFileFailed'))
    } finally {
      setRemovingFileId(null)
    }
  }, [item.id, removeConfirmFileId, onUpdate, tHub])

  const handleFilesAdded = useCallback(() => {
    setFiles(null)
    void fetchFiles()
    onUpdate()
  }, [fetchFiles, onUpdate])

  const existingFileIds = new Set(files?.map((f) => f.id) ?? [])

  const statusBadge = (status: string) => {
    if (status === 'active')
      return <Badge variant="outline" className="border-success/30 text-success">{t('list.statusActive')}</Badge>
    if (status === 'expired')
      return <Badge variant="outline" className="border-warning/30 text-warning">{t('list.statusExpired')}</Badge>
    return <Badge variant="outline" className="text-muted-foreground">{t('list.statusDeleted')}</Badge>
  }

  return (
    <>
      <Collapsible onOpenChange={handleOpenChange}>
        <div className="rounded-lg border border-border/70">
          {/* Header row */}
          <div className="flex items-center gap-3 px-4 py-3">
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
              >
                <ChevronDown className="h-4 w-4 transition-transform duration-[var(--duration-fast)] [[data-state=open]_&]:rotate-180" />
                <span className="sr-only">{tHub('moreActions')}</span>
              </Button>
            </CollapsibleTrigger>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
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
              </div>
              {item.expires_at && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t('list.expires', { date: formatTime(item.expires_at, i18n.language) })}
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {item.status === 'active' && (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2"
                    onClick={() => { void handleCopy() }}
                  >
                    {copiedToken ? (
                      <Check className="mr-1 h-3.5 w-3.5" />
                    ) : (
                      <Copy className="mr-1 h-3.5 w-3.5" />
                    )}
                    <span className="hidden sm:inline">
                      {copiedToken ? t('list.copied') : t('list.copyLink')}
                    </span>
                  </Button>
                  {typeof navigator.share === 'function' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 px-0"
                      aria-label={tHub('share')}
                      onClick={() => { void handleNativeShare() }}
                    >
                      <Share2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 px-0"
                    aria-label={tHub('openShareLink')}
                    asChild
                  >
                    <a href={`/f/${item.token}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                </>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 w-8 px-0 text-destructive hover:text-destructive"
                aria-label={tHub('deleteShare')}
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Expandable details */}
          <CollapsibleContent>
            <div className="border-t border-border/70 px-4 py-3 space-y-2">
              {item.extract_code && (
                <p className="text-xs text-muted-foreground">
                  {t('list.extractCode', { code: item.extract_code })}
                </p>
              )}
              {item.message && (
                <p className="text-xs text-muted-foreground">{item.message}</p>
              )}
              {loadingFiles ? (
                <div className="space-y-1.5">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-5 w-1/2" />
                </div>
              ) : files ? (
                <div className="space-y-1">
                  {files.length === 0 ? (
                    <p className="py-2 text-center text-xs text-muted-foreground">
                      {tHub('shareEmpty')}
                    </p>
                  ) : (
                    files.map((f) => {
                      const FileIcon = getFileTypeIcon(f.content_type)
                      const isRemoving = removingFileId === f.id
                      return (
                        <div key={f.id} className="group flex items-center gap-2 text-sm">
                          <FileIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate">{f.file_name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {formatBytes(f.size)}
                          </span>
                          {item.status === 'active' && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-xs text-muted-foreground sm:opacity-0 sm:group-hover:opacity-100"
                              aria-label={tHub('removeFromShare')}
                              disabled={isRemoving}
                              onClick={() => setRemoveConfirmFileId(f.id)}
                            >
                              {isRemoving ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <X className="h-3 w-3" />
                              )}
                            </Button>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{tHub('loadFailed')}</p>
              )}

              {/* Add files button */}
              {item.status === 'active' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setAddDialogOpen(true)}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  {tHub('addFiles')}
                </Button>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* Add files dialog */}
      <AddFilesDialog
        open={addDialogOpen}
        shareId={item.id}
        existingFileIds={existingFileIds}
        onClose={() => setAddDialogOpen(false)}
        onAdded={handleFilesAdded}
      />

      {/* Remove file confirm */}
      <ConfirmDialog
        open={removeConfirmFileId !== null}
        onOpenChange={(o) => { if (!o) setRemoveConfirmFileId(null) }}
        title={tHub('removeFromShareConfirmTitle')}
        description={tHub('removeFromShareConfirmDesc')}
        confirmLabel={tHub('removeFromShare')}
        cancelLabel={tHub('cancel')}
        variant="destructive"
        onConfirm={() => { void handleRemoveFile() }}
      />
    </>
  )
}

// ── Shares tab ─────────────────────────────────────────────────────

export function SharesTab() {
  const { t: tHub } = useTranslation('hub')
  const { t } = useTranslation('transfer')
  const [items, setItems] = useState<ShareGroupListItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
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

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await deleteShare(deleteTarget.id)
      setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id))
      setTotal((prev) => prev - 1)
    } catch {
      toast.error(tHub('deleteShareFailed'))
    } finally {
      setDeleteTarget(null)
    }
  }, [deleteTarget, tHub])

  const handleItemUpdate = useCallback(() => {
    void fetchList()
  }, [fetchList])

  return (
    <>
      <div className="space-y-3">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <PackageOpen className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">{t('list.empty')}</p>
            <Button size="sm" variant="outline" asChild>
              <Link to="/transfer">
                <Plus className="mr-1 h-3.5 w-3.5" />
                {t('list.createFirst')}
              </Link>
            </Button>
          </div>
        ) : (
          <>
            {items.map((item) => (
              <ShareItem
                key={item.id}
                item={item}
                onDelete={() => setDeleteTarget(item)}
                onUpdate={handleItemUpdate}
              />
            ))}

            <SimplePagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
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
