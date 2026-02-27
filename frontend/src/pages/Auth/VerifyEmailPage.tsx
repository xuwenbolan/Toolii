import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SEOHead } from '@/components/common/SEOHead'
import { api } from '@/services/api'
import { fetchMe } from '@/services/authApi'

type VerifyState = 'verifying' | 'success' | 'error'

export function VerifyEmailPage() {
  const { t } = useTranslation('auth')
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [state, setState] = useState<VerifyState>('verifying')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!token) return

    let cancelled = false
    ;(async () => {
      try {
        await api.post('/api/auth/verify-email', { token })
        if (cancelled) return
        setState('success')
        // Refresh user info so email_verified updates in store
        await fetchMe()
      } catch (err: unknown) {
        if (cancelled) return
        const msg =
          (err as { response?: { data?: { detail?: string } } })?.response?.data
            ?.detail ?? t('verifyEmail.failed')
        setState('error')
        setErrorMsg(msg)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [token, t])

  if (!token) {
    return (
      <>
        <SEOHead title={t('verifyEmail.title')} noindex />
        <Card className="mx-auto max-w-md">
          <CardHeader>
            <CardTitle>{t('verifyEmail.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-red-600 dark:text-red-400">{t('verifyEmail.missingToken')}</p>
              <Link
                to="/"
                className="inline-block text-sm text-foreground underline underline-offset-4"
              >
                {t('verifyEmail.backHome')}
              </Link>
            </div>
          </CardContent>
        </Card>
      </>
    )
  }

  return (
    <>
      <SEOHead title={t('verifyEmail.title')} noindex />
      <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>{t('verifyEmail.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {state === 'verifying' && (
          <p className="text-muted-foreground">{t('verifyEmail.verifying')}</p>
        )}
        {state === 'success' && (
          <div className="space-y-3">
            <p className="text-green-700 dark:text-green-400">
              {t('verifyEmail.success')}
            </p>
            <Link
              to="/"
              className="inline-block text-sm text-foreground underline underline-offset-4"
            >
              {t('verifyEmail.backHome')}
            </Link>
          </div>
        )}
        {state === 'error' && (
          <div className="space-y-3">
            <p className="text-red-600 dark:text-red-400">{errorMsg}</p>
            <Link
              to="/"
              className="inline-block text-sm text-foreground underline underline-offset-4"
            >
              {t('verifyEmail.backHome')}
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
    </>
  )
}
