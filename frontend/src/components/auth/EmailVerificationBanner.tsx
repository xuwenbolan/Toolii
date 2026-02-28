import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { api } from '@/services/api'
import { getTranslatedApiError } from '@/lib/apiErrors'
import { useAuthStore } from '@/stores/authStore'

export function EmailVerificationBanner() {
  const { t } = useTranslation('auth')
  const user = useAuthStore((s) => s.user)
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

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
      <span>{t('emailVerification.verifyPrompt')}</span>
      {sent ? (
        <span className="ml-2 font-medium text-green-700 dark:text-green-400">
          {t('emailVerification.sent')}
        </span>
      ) : (
        <button
          type="button"
          onClick={handleResend}
          disabled={sending}
          className="ml-2 font-medium underline underline-offset-2 transition-colors hover:text-amber-900 disabled:opacity-50 dark:hover:text-amber-100"
        >
          {sending ? t('emailVerification.sending') : t('emailVerification.resend')}
        </button>
      )}
      {error && (
        <span className="ml-2 text-red-600 dark:text-red-400">{error}</span>
      )}
    </div>
  )
}
