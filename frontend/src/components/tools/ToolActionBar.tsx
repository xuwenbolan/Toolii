import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = {
  mode?: 'manual' | 'auto'
  status: string
  pending?: boolean
  progress?: number | null
  error?: string | null
  done?: boolean
  secondaryCtaLabel?: string
  secondaryCtaDisabled?: boolean
  onSecondaryCta?: () => void
  ctaLabel?: string
  ctaDisabled?: boolean
  onCta?: () => void
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
  secondaryCtaLabel,
  secondaryCtaDisabled = false,
  onSecondaryCta,
  ctaLabel,
  ctaDisabled = false,
  onCta,
  maxWidthClassName = 'max-w-6xl',
  className,
}: Props) {
  const clampedProgress = progress == null ? null : Math.max(0, Math.min(100, Math.round(progress)))

  return (
    <div className={cn('fixed inset-x-0 bottom-0 z-40 px-3 pb-3 sm:px-4 sm:pb-4 motion-safe:animate-bar-enter', className)}>
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
                  <span className="success-check text-emerald-500" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                ) : null}
                <p className={cn('truncate text-sm', error ? 'text-destructive' : 'text-muted-foreground')}>{status}</p>
              </div>
            </div>
            {mode === 'manual' ? (
              <div className="flex shrink-0 items-center gap-2">
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
              </div>
            ) : null}
          </div>
          {pending && clampedProgress != null ? (
            <div
              className={cn(
                'h-1.5 w-full bg-muted/80',
                clampedProgress >= 100 && 'motion-safe:animate-[glow-pulse_1.2s_var(--ease-in-out)_2]',
              )}
            >
              <div
                className="h-full bg-primary transition-[width] duration-[var(--duration-normal)] ease-[var(--ease-in-out)]"
                style={{ width: `${clampedProgress}%` }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
