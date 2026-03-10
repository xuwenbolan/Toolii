import { Coins, Eye, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useToolStore } from '@/stores/toolStore'

type Props = {
  mode?: 'manual' | 'auto'
  status: string
  pending?: boolean
  progress?: number | null
  error?: string | null
  done?: boolean
  /** Backend tool name (e.g. "image/compress") to show credit cost badge */
  toolName?: string
  secondaryCtaLabel?: string
  secondaryCtaDisabled?: boolean
  onSecondaryCta?: () => void
  ctaLabel?: string
  ctaDisabled?: boolean
  onCta?: () => void
  onViewResult?: () => void
  maxWidthClassName?: string
  className?: string
}

export function ToolActionBar({
  mode = 'manual',
  status,
  pending = false,
  progress = null,
  error = null,
  done = false,
  toolName,
  secondaryCtaLabel,
  secondaryCtaDisabled = false,
  onSecondaryCta,
  ctaLabel,
  ctaDisabled = false,
  onCta,
  onViewResult,
  maxWidthClassName = 'max-w-6xl',
  className,
}: Props) {
  const { t } = useTranslation('common')
  const { getToolCost } = useToolStore()
  const creditCost = toolName ? getToolCost(toolName) : 0
  const clampedProgress = progress == null ? null : Math.max(0, Math.min(100, Math.round(progress)))
  const showViewResult = done && !pending && !error && onViewResult
  const showCost = creditCost > 0 && !pending && !done && !error

  return (
    <div className={cn('fixed inset-x-0 bottom-0 z-40 px-3 pb-3 sm:px-4 sm:pb-4 motion-safe:animate-fade-in', className)} style={{ bottom: 'var(--sai-bottom)' }}>
      <div className={cn('mx-auto w-full', maxWidthClassName)}>
        <div
          className={cn(
            'overflow-hidden rounded-xl border border-border/70 bg-background/90 shadow-lg backdrop-blur-md',
            error ? 'border-destructive/25 bg-destructive-light/60' : null,
          )}
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {pending ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" /> : null}
                {done && !pending && !error ? (
                  <svg className="text-success" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : null}
                <p className={cn('truncate text-sm', error ? 'text-destructive' : 'text-muted-foreground')}>{status}</p>
                {showCost ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                    <Coins className="h-3 w-3" />
                    {t('actions.creditCost', { count: creditCost })}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {showViewResult ? (
                <Button type="button" size="sm" variant="outline" onClick={onViewResult}>
                  <Eye className="mr-1.5 h-4 w-4" />
                  {t('actions.viewResult')}
                </Button>
              ) : null}
              {mode === 'manual' ? (
                <>
                  {onSecondaryCta && secondaryCtaLabel ? (
                    <Button type="button" size="sm" variant="outline" onClick={onSecondaryCta} disabled={pending || secondaryCtaDisabled}>
                      {secondaryCtaLabel}
                    </Button>
                  ) : null}
                  {onCta && ctaLabel ? (
                    <Button type="button" size="sm" onClick={onCta} disabled={pending || ctaDisabled}>
                      {ctaLabel}
                    </Button>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
          {pending && clampedProgress != null ? (
            <div
              className={cn(
                'h-1.5 w-full bg-muted/80',
              )}
            >
              <div
                className="h-full bg-primary transition-[width] duration-[var(--duration-fast)] ease-linear"
                style={{ width: `${clampedProgress}%` }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
