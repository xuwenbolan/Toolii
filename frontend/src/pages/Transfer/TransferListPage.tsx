import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, ExternalLink, Flame, PackageOpen, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { SEOHead } from '@/components/common/SEOHead'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatBytes } from '@/lib/fileValidation'
import {
  TRANSFER_STATUS,
  deleteTransfer,
  getMyTransfers,
  type TransferMyItem,
} from '@/services/transferApi'

const PAGE_SIZE = 20

function formatTime(value: string, locale: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function TransferListPage() {
  const { t, i18n } = useTranslation('transfer')
  const [items, setItems] = useState<TransferMyItem[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TransferMyItem | null>(null)

  const fetchList = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await getMyTransfers(PAGE_SIZE, offset)
      setItems(res.items)
      setTotal(res.total)
    } catch {
      setLoadError(t('list.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [offset, t])

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
      await deleteTransfer(deleteTarget.id)
      setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id))
      setTotal((prev) => prev - 1)
    } catch {
      // deletion failed silently, user can retry
    } finally {
      setDeleteTarget(null)
    }
  }, [deleteTarget])

  const statusBadge = (status: string) => {
    if (status === TRANSFER_STATUS.ACTIVE)
      return <Badge variant="outline" className="border-success/30 text-success">{t('list.statusActive')}</Badge>
    if (status === TRANSFER_STATUS.EXPIRED)
      return <Badge variant="outline" className="border-warning/30 text-warning">{t('list.statusExpired')}</Badge>
    if (status === TRANSFER_STATUS.BURNED)
      return <Badge variant="outline" className="border-warning/30 text-warning">{t('list.statusBurned')}</Badge>
    return <Badge variant="outline" className="text-muted-foreground">{t('list.statusDeleted')}</Badge>
  }

  return (
    <>
      <SEOHead title={t('list.title')} noindex />

      <div className="space-y-4">
        <h1 className="text-xl font-semibold tracking-tight">{t('list.title')}</h1>

        {loading ? (
          <p className="text-sm text-muted-foreground">{t('receive.loading')}</p>
        ) : loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <PackageOpen className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">{t('list.empty')}</p>
            <Button variant="outline" size="sm" asChild>
              <Link to="/transfer">{t('list.createFirst')}</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <Card key={item.id} className="border-border/70 shadow-sm">
                <CardContent className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {statusBadge(item.status)}
                      {item.burn_after_read ? (
                        <Flame className="h-3.5 w-3.5 text-warning" aria-label={t('create.burnAfterReadLabel')} />
                      ) : null}
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
                    <p className="text-xs text-muted-foreground">
                      {t('list.expires', { date: formatTime(item.expires_at, i18n.language) })}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {item.status === TRANSFER_STATUS.ACTIVE ? (
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

            {/* Pagination */}
            {total > PAGE_SIZE ? (
              <div className="flex items-center justify-between pt-2 text-sm">
                <span className="text-muted-foreground">
                  {offset + 1}-{Math.min(offset + PAGE_SIZE, total)} / {total}
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={offset === 0}
                    onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
                  >
                    {t('list.previous')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={offset + PAGE_SIZE >= total}
                    onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
                  >
                    {t('list.next')}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title={t('list.deleteConfirmTitle')}
        description={t('list.deleteConfirmDesc')}
        confirmLabel={t('list.delete')}
        cancelLabel={t('receive.cancel')}
        variant="destructive"
        onConfirm={() => { void handleDeleteConfirm() }}
      />
    </>
  )
}
