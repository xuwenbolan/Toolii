import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getTranslatedApiError } from '@/lib/apiErrors'
import { isIntInRange, parseFiniteNumber } from '@/lib/numberInput'
import {
  cancelShareLink,
  createShareLink,
  fetchShareLinks,
  type ShareLinkItem,
} from '@/services/creditsApi'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged?: () => void
}

function formatTime(value: string | null, locale: string) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function ShareCreditsDialog({ open, onOpenChange, onChanged }: Props) {
  const { t, i18n } = useTranslation('credits')
  const [amountInput, setAmountInput] = useState('1')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [links, setLinks] = useState<ShareLinkItem[]>([])
  const [loadingLinks, setLoadingLinks] = useState(false)
  const [linksError, setLinksError] = useState<string | null>(null)
  const amount = parseFiniteNumber(amountInput)
  const amountValid = amount != null && isIntInRange(amount, 1, 1000)

  const pendingLinks = useMemo(() => links.filter((item) => item.status === 'pending').slice(0, 6), [links])

  function statusLabel(status: string) {
    if (status === 'pending') return t('share.statusPending')
    if (status === 'claimed') return t('share.statusClaimed')
    if (status === 'canceled') return t('share.statusCanceled')
    if (status === 'expired') return t('share.statusExpired')
    return status
  }

  const loadLinks = useCallback(async () => {
    setLoadingLinks(true)
    setLinksError(null)
    try {
      const res = await fetchShareLinks({ limit: 20, offset: 0 })
      setLinks(res.items)
    } catch {
      setLinksError(t('share.linksLoadFailed'))
    } finally {
      setLoadingLinks(false)
    }
  }, [t])

  useEffect(() => {
    if (!open) return
    void loadLinks()
  }, [open, loadLinks])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">{t('share.title')}</DialogTitle>
        <DialogDescription className="sr-only">{t('share.dialogDescription')}</DialogDescription>
        <Card className="w-full border-0 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('share.title')}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {t('share.dialogDescription')}
            </p>
          </CardHeader>
          <CardContent className="max-h-[min(85dvh,44rem)] space-y-4 overflow-y-auto pr-1">
            <form
              className="space-y-3 rounded-lg border p-3"
              onSubmit={async (event) => {
                event.preventDefault()
                setError(null)
                setShareUrl(null)
                const value = amount ?? 0
                if (!amountValid || !Number.isInteger(value) || value < 1 || value > 1000) {
                  setError(t('share.amountInvalid'))
                  return
                }

                setPending(true)
                try {
                  const result = await createShareLink(value)
                  const origin = window.location.origin
                  setShareUrl(`${origin}${result.share_path}`)
                  await loadLinks()
                  onChanged?.()
                } catch (err) {
                  setError(getTranslatedApiError(err, t('share.createFailed')))
                } finally {
                  setPending(false)
                }
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="shareAmount">{t('share.amountLabel')}</Label>
                <Input
                  id="shareAmount"
                  type="number"
                  min={1}
                  max={1000}
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                />
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button className="w-full" type="submit" disabled={pending || !amountValid}>
                {pending ? t('share.creating') : t('share.createButton')}
              </Button>
            </form>

            {shareUrl ? (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <p className="text-xs font-medium">{t('share.linkGenerated')}</p>
                <Input readOnly value={shareUrl} />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="w-full sm:flex-1"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(shareUrl)
                      } catch {
                        // Ignore clipboard failures.
                      }
                    }}
                  >
                    {t('share.copyLink')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="w-full sm:flex-1"
                    onClick={() => window.open(shareUrl, '_blank', 'noopener,noreferrer')}
                  >
                    {t('share.openPage')}
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-medium">{t('share.recentLinks')}</p>
                <Button type="button" size="sm" variant="outline" onClick={() => void loadLinks()} disabled={loadingLinks}>
                  {loadingLinks ? t('share.refreshing') : t('share.refresh')}
                </Button>
              </div>

              {linksError ? (
                <p className="text-xs text-destructive">{linksError}</p>
              ) : pendingLinks.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('share.noPendingShares')}</p>
              ) : (
                <div className="space-y-2">
                  {pendingLinks.map((item) => (
                    <div key={item.id} className="rounded-md border bg-muted/20 p-2">
                      <div className="flex flex-col gap-2 text-xs sm:flex-row sm:items-center sm:justify-between">
                        <p className="font-medium">#{item.id} · {item.amount} Credits · {statusLabel(item.status)}</p>
                        {item.status === 'pending' ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="w-full sm:w-auto"
                            onClick={async () => {
                              setLinksError(null)
                              try {
                                await cancelShareLink(item.id)
                                await loadLinks()
                                onChanged?.()
                              } catch {
                                setLinksError(t('share.cancelFailed'))
                              }
                            }}
                          >
                            {t('share.cancel')}
                          </Button>
                        ) : null}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {t('share.createdAt', { date: formatTime(item.created_at, i18n.language) })} · {t('share.expiresAt', { date: formatTime(item.expires_at, i18n.language) })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
                {t('share.close')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  )
}
