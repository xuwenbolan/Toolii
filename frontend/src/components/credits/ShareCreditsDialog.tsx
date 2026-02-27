import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

function getApiErrorMessage(error: unknown, fallback: string): string {
  const maybe = error as { response?: { data?: { message?: string } } }
  return maybe?.response?.data?.message || fallback
}

function formatTime(value: string | null) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function ShareCreditsDialog({ open, onOpenChange, onChanged }: Props) {
  const { t } = useTranslation('credits')
  const [amount, setAmount] = useState<number | ''>(1)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [links, setLinks] = useState<ShareLinkItem[]>([])
  const [loadingLinks, setLoadingLinks] = useState(false)
  const [linksError, setLinksError] = useState<string | null>(null)

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
    } catch (err) {
      setLinksError(getApiErrorMessage(err, t('share.linksLoadFailed')))
    } finally {
      setLoadingLinks(false)
    }
  }, [t])

  useEffect(() => {
    if (!open) return
    void loadLinks()
  }, [open, loadLinks])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onOpenChange])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        aria-label={t('share.closeDialog')}
        onClick={() => onOpenChange(false)}
      />
      <div className="absolute inset-0 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto flex min-h-full w-full max-w-xl items-start sm:items-center">
          <Card className="w-full shadow-2xl">
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
                  const value = amount === '' ? 0 : amount
                  if (!Number.isInteger(value) || value < 1 || value > 1000) {
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
                    setError(getApiErrorMessage(err, t('share.createFailed')))
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
                    value={amount}
                    onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                </div>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <Button className="w-full" type="submit" disabled={pending}>
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
                                } catch (err) {
                                  setLinksError(getApiErrorMessage(err, t('share.cancelFailed')))
                                }
                              }}
                            >
                              {t('share.cancel')}
                            </Button>
                          ) : null}
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {t('share.createdAt', { date: formatTime(item.created_at) })} · {t('share.expiresAt', { date: formatTime(item.expires_at) })}
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
        </div>
      </div>
    </div>
  )
}
