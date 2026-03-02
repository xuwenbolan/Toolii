import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useConsentStore } from '@/stores/consentStore'

export function CookieBanner() {
  const { t } = useTranslation('consent')
  const consent = useConsentStore((s) => s.cookieConsent)
  const accept = useConsentStore((s) => s.accept)
  const reject = useConsentStore((s) => s.reject)

  if (consent !== 'unknown') return null

  return (
    <div className="fixed inset-x-0 z-50 px-3" style={{ bottom: 'calc(0.75rem + var(--sai-bottom))' }}>
      <Card className="mx-auto flex w-full max-w-4xl flex-col gap-3 p-3 shadow-lg sm:flex-row sm:items-start">
        <div className="space-y-2">
          <p className="text-xs leading-relaxed text-muted-foreground">{t('cookieBanner.message')}</p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Link className="transition hover:text-foreground" to="/legal/privacy">
              {t('cookieBanner.privacyLink')}
            </Link>
            <Link className="transition hover:text-foreground" to="/legal/terms">
              {t('cookieBanner.termsLink')}
            </Link>
          </div>
        </div>
        <div className="ml-auto flex shrink-0 gap-2 sm:self-center">
          <Button variant="ghost" size="sm" onClick={reject}>
            {t('cookieBanner.reject')}
          </Button>
          <Button size="sm" onClick={accept}>
            {t('cookieBanner.accept')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
