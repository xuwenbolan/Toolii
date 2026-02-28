import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, ExternalLink, Flame, Trash2 } from 'lucide-react'

import { SEOHead } from '@/components/common/SEOHead'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatBytes } from '@/lib/fileValidation'
import { deleteTransfer, getMyTransfers, type TransferMyItem } from '@/services/transferApi'

function formatTime(value: string, locale: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function TransferListPage() {
  const { t, i18n } = useTranslation('transfer')
  const [items, setItems] = useState<TransferMyItem[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getMyTransfers()
      setItems(res.items)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

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
      // fallback
    }
  }, [])

  const handleDelete = useCallback(
    async (item: TransferMyItem) => {
      if (!window.confirm(t('list.deleteConfirm'))) return
      try {
        await deleteTransfer(item.id)
        setItems((prev) => prev.filter((i) => i.id !== item.id))
      } catch {
        // ignore
      }
    },
    [t],
  )

  const statusBadge = (status: string) => {
    if (status === 'active')
      return <Badge variant="outline" className="border-emerald-500/30 text-emerald-600">{t('list.statusActive')}</Badge>
    if (status === 'expired')
      return <Badge variant="outline" className="border-amber-500/30 text-amber-600">{t('list.statusExpired')}</Badge>
    if (status === 'burned')
      return <Badge variant="outline" className="border-orange-500/30 text-orange-600">{t('list.statusBurned')}</Badge>
    return <Badge variant="outline" className="text-muted-foreground">{t('list.statusDeleted')}</Badge>
  }

  return (
    <>
      <SEOHead title={t('list.title')} noindex />

      <div className="space-y-4">
        <h1 className="text-xl font-semibold tracking-tight">{t('list.title')}</h1>

        {loading ? (
          <p className="text-sm text-muted-foreground">{t('receive.loading')}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('list.empty')}</p>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <Card key={item.id} className="border-border/70 shadow-sm">
                <CardContent className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {statusBadge(item.status)}
                      {item.burn_after_read ? (
                        <Flame className="h-3.5 w-3.5 text-orange-500" aria-label={t('create.burnAfterReadLabel')} />
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
                      onClick={() => { void handleDelete(item) }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
