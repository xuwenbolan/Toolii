import { useCallback, useEffect, useMemo, useState } from 'react'

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
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function statusLabel(status: string) {
  if (status === 'pending') return '待领取'
  if (status === 'claimed') return '已领取'
  if (status === 'canceled') return '已取消'
  if (status === 'expired') return '已过期'
  return status
}

export function ShareCreditsDialog({ open, onOpenChange, onChanged }: Props) {
  const [amount, setAmount] = useState<number | ''>(1)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [links, setLinks] = useState<ShareLinkItem[]>([])
  const [loadingLinks, setLoadingLinks] = useState(false)
  const [linksError, setLinksError] = useState<string | null>(null)

  const pendingLinks = useMemo(() => links.filter((item) => item.status === 'pending').slice(0, 6), [links])

  const loadLinks = useCallback(async () => {
    setLoadingLinks(true)
    setLinksError(null)
    try {
      const res = await fetchShareLinks({ limit: 20, offset: 0 })
      setLinks(res.items)
    } catch (err) {
      setLinksError(getApiErrorMessage(err, '分享记录加载失败'))
    } finally {
      setLoadingLinks(false)
    }
  }, [])

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
        aria-label="关闭弹窗"
        onClick={() => onOpenChange(false)}
      />
      <div className="absolute inset-x-4 top-1/2 mx-auto w-auto max-w-md -translate-y-1/2">
        <Card className="shadow-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">分享 Credits</CardTitle>
            <p className="text-sm text-muted-foreground">
              创建分享链接后会先冻结 Credits，领取成功后转给对方；取消/过期会自动退回。
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="space-y-3 rounded-lg border p-3"
              onSubmit={async (event) => {
                event.preventDefault()
                setError(null)
                setShareUrl(null)
                const value = amount === '' ? 0 : amount
                if (!Number.isInteger(value) || value < 1 || value > 1000) {
                  setError('分享数量必须是 1-1000 的整数')
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
                  setError(getApiErrorMessage(err, '创建分享链接失败'))
                } finally {
                  setPending(false)
                }
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="shareAmount">分享数量</Label>
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
                {pending ? '创建中…' : '创建分享链接'}
              </Button>
            </form>

            {shareUrl ? (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <p className="text-xs font-medium">分享链接已生成</p>
                <Input readOnly value={shareUrl} />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(shareUrl)
                      } catch {
                        // Ignore clipboard failures.
                      }
                    }}
                  >
                    复制链接
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="flex-1"
                    onClick={() => window.open(shareUrl, '_blank', 'noopener,noreferrer')}
                  >
                    打开落地页
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-medium">最近分享记录</p>
                <Button type="button" size="sm" variant="outline" onClick={() => void loadLinks()} disabled={loadingLinks}>
                  {loadingLinks ? '刷新中…' : '刷新'}
                </Button>
              </div>

              {linksError ? (
                <p className="text-xs text-destructive">{linksError}</p>
              ) : pendingLinks.length === 0 ? (
                <p className="text-xs text-muted-foreground">暂无待领取分享</p>
              ) : (
                <div className="space-y-2">
                  {pendingLinks.map((item) => (
                    <div key={item.id} className="rounded-md border bg-muted/20 p-2">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <p className="font-medium">#{item.id} · {item.amount} Credits · {statusLabel(item.status)}</p>
                        {item.status === 'pending' ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              setLinksError(null)
                              try {
                                await cancelShareLink(item.id)
                                await loadLinks()
                                onChanged?.()
                              } catch (err) {
                                setLinksError(getApiErrorMessage(err, '取消分享失败'))
                              }
                            }}
                          >
                            取消
                          </Button>
                        ) : null}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        创建 {formatTime(item.created_at)} · 过期 {formatTime(item.expires_at)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                关闭
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
