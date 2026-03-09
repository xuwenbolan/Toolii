import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  PackageOpen,
  Trash2,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBytes } from '@/lib/fileValidation'
import {
  deleteShare,
  getShareInfo,
  listShares,
  type ShareFileItem,
  type ShareGroupListItem,
  type ShareInfoResponse,
} from '@/services/hubApi'

import { getFileTypeIcon } from './fileTypeIcons'
import { formatTime } from './utils'

const PAGE_SIZE = 20

function ShareItem({
  item,
  onDelete,
}: {
  item: ShareGroupListItem
  onDelete: () => void
}) {
  const { t: tHub } = useTranslation('hub')
  const { t, i18n } = useTranslation('transfer')
  const [copiedToken, setCopiedToken] = useState(false)
  const [files, setFiles] = useState<ShareFileItem[] | null>(null)
  const [loadingFiles, setLoadingFiles] = useState(false)

  const handleCopy = async () => {
    const url = `${window.location.origin}/t/${item.token}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedToken(true)
      setTimeout(() => setCopiedToken(false), 2000)
    } catch {
      // clipboard not available
    }
  }

  const handleOpenChange = useCallback(
    async (open: boolean) => {
      if (!open || files !== null || loadingFiles) return
      setLoadingFiles(true)
      try {
        const info = await getShareInfo(item.token, item.extract_code ?? undefined)
        if ('files' in info) {
          setFiles((info as ShareInfoResponse).files)
        }
      } catch {
        // silent
      } finally {
        setLoadingFiles(false)
      }
    },
    [item.token, files, loadingFiles],
  )

  const statusBadge = (status: string) => {
    if (status === 'active')
      return <Badge variant="outline" className="border-success/30 text-success">{t('list.statusActive')}</Badge>
    if (status === 'expired')
      return <Badge variant="outline" className="border-warning/30 text-warning">{t('list.statusExpired')}</Badge>
    return <Badge variant="outline" className="text-muted-foreground">{t('list.statusDeleted')}</Badge>
  }

  return (
    <Collapsible onOpenChange={handleOpenChange}>
      <div className="rounded-lg border border-border/70">
        {/* Header row */}
        <div className="flex items-center gap-3 px-4 py-3">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              aria-label="Toggle details"
            >
              <ChevronDown className="h-4 w-4 transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
            </Button>
          </CollapsibleTrigger>

          <div className="min-w-0 flex-1">
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
                  {copiedToken ? t('list.copied') : t('list.copyLink')}
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
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 w-8 px-0 text-destructive hover:text-destructive"
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
                {files.map((f) => {
                  const FileIcon = getFileTypeIcon(f.content_type)
                  return (
                    <div key={f.id} className="flex items-center gap-2 text-sm">
                      <FileIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 truncate">{f.file_name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatBytes(f.size)}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{tHub('loadFailed')}</p>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

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
      // silent
    } finally {
      setDeleteTarget(null)
    }
  }, [deleteTarget])

  const offset = (page - 1) * PAGE_SIZE

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
          </div>
        ) : (
          <>
            {items.map((item) => (
              <ShareItem
                key={item.id}
                item={item}
                onDelete={() => setDeleteTarget(item)}
              />
            ))}

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
            )}
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
