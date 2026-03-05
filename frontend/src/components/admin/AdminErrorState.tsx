import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'

import { Button } from '@/components/ui/button'

type Props = {
  onRetry?: () => void
}

export function AdminErrorState({ onRetry }: Props) {
  const { t } = useTranslation('console')

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
      <AlertTriangle size={32} className="text-destructive" />
      <p className="text-sm">{t('common.loadError')}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  )
}
