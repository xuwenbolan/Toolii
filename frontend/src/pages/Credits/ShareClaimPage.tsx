import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { BalanceDisplay } from '@/components/credits/BalanceDisplay'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuth } from '@/hooks/useAuth'
import { useCredits } from '@/hooks/useCredits'
import { claimShareLink, getShareInfo, type ShareClaimResponse, type ShareInfoResponse } from '@/services/creditsApi'

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
  if (status === 'expired') return '已过期'
  if (status === 'canceled') return '已取消'
  return status
}

export function ShareClaimPage() {
  const { token = '' } = useParams()
  const { isAuthenticated } = useAuth()
  const credits = useCredits({ enabled: isAuthenticated, includeTransactions: false })

  const [info, setInfo] = useState<ShareInfoResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [claimPending, setClaimPending] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)
  const [claimResult, setClaimResult] = useState<ShareClaimResponse | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    setClaimError(null)
    void getShareInfo(token)
      .then((data) => {
        if (!active) return
        setInfo(data)
      })
      .catch((err) => {
        if (!active) return
        setError(getApiErrorMessage(err, '分享链接不存在或已失效'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token])

  const redirectTo = useMemo(() => encodeURIComponent(`/share/${token}`), [token])

  return (
    <Card>
      <CardHeader>
        <CardTitle>领取分享 Credits</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? <p className="text-sm text-muted-foreground">正在加载分享信息…</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {info ? (
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p>分享数量：{info.amount} Credits</p>
              <p>状态：{statusLabel(info.status)}</p>
              <p>创建时间：{formatTime(info.created_at)}</p>
              <p>过期时间：{formatTime(info.expires_at)}</p>
            </div>

            {claimResult ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
                {claimResult.message}，到账 {claimResult.amount} Credits（当前余额 {claimResult.balance}）。
              </div>
            ) : null}

            {isAuthenticated ? (
              <>
                <BalanceDisplay
                  balance={credits.balance}
                  pending={credits.balancePending}
                  error={credits.balanceError}
                  onRefresh={() => {
                    void credits.refreshBalance()
                  }}
                />
                {claimError ? <p className="text-sm text-destructive">{claimError}</p> : null}
                <Button
                  type="button"
                  className="w-full"
                  disabled={!info.can_claim || claimPending}
                  onClick={async () => {
                    setClaimPending(true)
                    setClaimError(null)
                    try {
                      const result = await claimShareLink(token)
                      setClaimResult(result)
                      setInfo((prev) => (prev ? { ...prev, status: 'claimed', can_claim: false } : prev))
                      void credits.refreshBalance()
                    } catch (err) {
                      setClaimError(getApiErrorMessage(err, '领取失败，请稍后重试'))
                      void getShareInfo(token)
                        .then((data) => setInfo(data))
                        .catch(() => undefined)
                    } finally {
                      setClaimPending(false)
                    }
                  }}
                >
                  {claimPending ? '领取中…' : info.can_claim ? '领取 Credits' : '当前不可领取'}
                </Button>
              </>
            ) : (
              <div className="rounded-lg border border-dashed p-3">
                <p className="text-sm text-muted-foreground">登录后即可领取该分享。</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Button asChild size="sm">
                    <Link to={`/auth/login?redirect=${redirectTo}`}>去登录</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/auth/register?redirect=${redirectTo}`}>注册</Link>
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
