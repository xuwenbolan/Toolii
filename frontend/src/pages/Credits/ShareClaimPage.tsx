import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'

import { SEOHead } from '@/components/common/SEOHead'
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
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function ShareClaimPage() {
  const { t } = useTranslation('credits')
  const { token = '' } = useParams()
  const { isAuthenticated } = useAuth()
  const credits = useCredits({ enabled: isAuthenticated, includeTransactions: false })

  const [info, setInfo] = useState<ShareInfoResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [claimPending, setClaimPending] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)
  const [claimResult, setClaimResult] = useState<ShareClaimResponse | null>(null)

  function statusLabel(status: string) {
    if (status === 'pending') return t('claimPage.statusPending')
    if (status === 'claimed') return t('claimPage.statusClaimed')
    if (status === 'expired') return t('claimPage.statusExpired')
    if (status === 'canceled') return t('claimPage.statusCanceled')
    return status
  }

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
        setError(getApiErrorMessage(err, t('claimPage.linkInvalid')))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token, t])

  const redirectTo = useMemo(() => encodeURIComponent(`/share/${token}`), [token])

  return (
    <>
      <SEOHead title={t('claimPage.seoTitle')} noindex />
      <Card>
        <CardHeader>
          <CardTitle>{t('claimPage.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? <p className="text-sm text-muted-foreground">{t('claimPage.loading')}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {info ? (
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p>{t('claimPage.amount', { amount: info.amount })}</p>
              <p>{t('claimPage.status', { status: statusLabel(info.status) })}</p>
              <p>{t('claimPage.createdAt', { date: formatTime(info.created_at) })}</p>
              <p>{t('claimPage.expiresAt', { date: formatTime(info.expires_at) })}</p>
            </div>

            {claimResult ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
                {claimResult.message}{', '}{t('claimPage.claimSuccess', { amount: claimResult.amount, balance: claimResult.balance })}
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
                      setClaimError(getApiErrorMessage(err, t('claimPage.claimFailed')))
                      void getShareInfo(token)
                        .then((data) => setInfo(data))
                        .catch(() => undefined)
                    } finally {
                      setClaimPending(false)
                    }
                  }}
                >
                  {claimPending ? t('claimPage.claiming') : info.can_claim ? t('claimPage.claimButton') : t('claimPage.cannotClaim')}
                </Button>
              </>
            ) : (
              <div className="rounded-lg border border-dashed p-3">
                <p className="text-sm text-muted-foreground">{t('claimPage.loginHint')}</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Button asChild size="sm">
                    <Link to={`/auth/login?redirect=${redirectTo}`}>{t('claimPage.login')}</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/auth/register?redirect=${redirectTo}`}>{t('claimPage.register')}</Link>
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
    </>
  )
}
