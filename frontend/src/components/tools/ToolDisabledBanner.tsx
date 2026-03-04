import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CircleOff } from 'lucide-react'

import { Button } from '@/components/ui/button'

export function ToolDisabledBanner() {
  const { t } = useTranslation('common')

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <CircleOff className="h-7 w-7 text-muted-foreground" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold text-muted-foreground">
          {t('toolDisabled.title')}
        </h2>
        <p className="max-w-sm text-sm text-muted-foreground/80">
          {t('toolDisabled.description')}
        </p>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link to="/">{t('toolDisabled.backHome')}</Link>
      </Button>
    </div>
  )
}
