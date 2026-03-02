import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { api } from '@/services/api'
import { getTranslatedApiError } from '@/lib/apiErrors'
import { useAuthStore } from '@/stores/authStore'

export function EmailVerificationBanner() {
  const { t } = useTranslation('auth')
  const user = useAuthStore((s) => s.user)
  const location = useLocation()
  const justRegistered = (location.state as { justRegistered?: boolean } | null)?.justRegistered
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!user || user.email_verified) return null

  const handleResend = async () => {
    setSending(true)
    setError(null)
    try {
      await api.post('/api/auth/resend-verification')
      setSent(true)
    } catch (err: unknown) {
      setError(getTranslatedApiError(err, t('emailVerification.sendFailed')))
    } finally {
      setSending(false)
    }
  }

  if (justRegistered) {
    return (
      <div className="border-b border-info/20 bg-info-light px-4 py-3 text-center">
        <p className="text-sm font-medium text-info">
          {t('emailVerification.registrationSuccess')}
        </p>
        <p className="mt-1 text-sm text-info">
          {t('emailVerification.verifyPrompt')}
          {sent ? (
            <span className="ml-2 font-medium text-success">
              {t('emailVerification.sent')}
            </span>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={sending}
              className="ml-2 font-medium underline underline-offset-2 transition-colors hover:text-foreground disabled:opacity-50"
            >
              {sending ? t('emailVerification.sending') : t('emailVerification.resend')}
            </button>
          )}
        </p>
        {error && (
          <p className="mt-1 text-sm text-destructive">{error}</p>
        )}
      </div>
    )
  }

  return (
    <div className="border-b border-warning/20 bg-warning-light px-4 py-2.5 text-center text-sm text-warning">
      <span>{t('emailVerification.verifyPrompt')}</span>
      {sent ? (
        <span className="ml-2 font-medium text-success">
          {t('emailVerification.sent')}
        </span>
      ) : (
        <button
          type="button"
          onClick={handleResend}
          disabled={sending}
          className="ml-2 font-medium underline underline-offset-2 transition-colors hover:text-foreground disabled:opacity-50"
        >
          {sending ? t('emailVerification.sending') : t('emailVerification.resend')}
        </button>
      )}
      {error && (
        <span className="ml-2 text-destructive">{error}</span>
      )}
    </div>
  )
}
