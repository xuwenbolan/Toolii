import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'

type Props = {
  children: ReactNode
}

export function PaywallGate({ children }: Props) {
  const { t } = useTranslation('idPhoto')
  const { isAuthenticated } = useAuth()

  if (isAuthenticated) {
    return <>{children}</>
  }

  return (
    <div className="space-y-3 rounded-xl border border-dashed p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{t('paywall.title')}</h3>
        <p className="text-xs text-muted-foreground">
          {t('paywall.description')}
        </p>
      </div>
      <div className="flex gap-2">
        <Button asChild size="sm">
          <Link to="/auth/login">{t('paywall.login')}</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/auth/register">{t('paywall.register')}</Link>
        </Button>
      </div>
    </div>
  )
}
