import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = {
  balance: number | null
  pending?: boolean
  error?: string | null
  requiredCredits?: number
  onRefresh?: () => void
  className?: string
}

export function BalanceDisplay({
  balance,
  pending,
  error,
  requiredCredits = 1,
  onRefresh,
  className,
}: Props) {
  const { t } = useTranslation('credits')
  const hasBalance = typeof balance === 'number'
  const enough = hasBalance && balance >= requiredCredits

  return (
    <div className={cn('rounded-lg border bg-muted/30 p-3', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t('balance.label')}</p>
          <div className="flex items-center gap-2">
            <p className="text-lg font-semibold tabular-nums">{hasBalance ? balance : '--'}</p>
            <span
              className={cn(
                'inline-flex rounded-full border px-2 py-0.5 text-[11px]',
                enough
                  ? 'border-success/40 bg-success/10 text-success'
                  : 'border-warning/40 bg-warning/10 text-warning',
              )}
            >
              {hasBalance ? (enough ? t('balance.enough', { credit: requiredCredits }) : t('balance.insufficient', { credit: requiredCredits })) : t('balance.notLoaded')}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('balance.costHint', { credit: requiredCredits })}
          </p>
          {error ? <p className="text-xs text-destructive">{t('balance.fetchFailed', { error })}</p> : null}
        </div>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full sm:w-auto"
          disabled={pending}
          onClick={() => onRefresh?.()}
        >
          {pending ? t('balance.refreshing') : t('balance.refresh')}
        </Button>
      </div>
    </div>
  )
}
