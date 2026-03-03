import { useMemo, useState } from 'react'
import { AlertTriangle, CircleAlert, CloudOff, Coins, Clock3, ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { ToolErrorMeta } from '@/lib/toolErrors'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type Props = {
  error?: string | null
  errorMeta?: ToolErrorMeta | null
  onRetry?: () => Promise<unknown> | void
  className?: string
}

type BannerTone = 'destructive' | 'warning' | 'info'

const toneClassMap: Record<BannerTone, string> = {
  destructive: 'border-destructive/30 bg-destructive-light/70',
  warning: 'border-warning/35 bg-warning-light/70',
  info: 'border-info/30 bg-info-light/70',
}

export function ToolErrorBanner({ error, errorMeta, onRetry, className }: Props) {
  const { t } = useTranslation('common')
  const [retrying, setRetrying] = useState(false)
  const hasError = Boolean(error || errorMeta)
  const kind = errorMeta?.kind ?? 'processing_failed'

  const visual = useMemo(() => {
    switch (kind) {
      case 'file_too_large':
      case 'unsupported_format':
      case 'invalid_input':
        return { tone: 'warning' as const, icon: AlertTriangle, title: t('errors.banner.invalidInputTitle') }
      case 'service_unavailable':
        return { tone: 'warning' as const, icon: CloudOff, title: t('errors.banner.serviceTitle') }
      case 'upload_failed':
      case 'timeout':
        return { tone: 'warning' as const, icon: CloudOff, title: t('errors.banner.networkTitle') }
      case 'rate_limited':
        return { tone: 'warning' as const, icon: Clock3, title: t('errors.banner.rateLimitTitle') }
      case 'auth_required':
        return { tone: 'info' as const, icon: ShieldAlert, title: t('errors.banner.authTitle') }
      case 'insufficient_credits':
        return { tone: 'info' as const, icon: Coins, title: t('errors.banner.creditsTitle') }
      case 'unknown':
      case 'processing_failed':
      default:
        return { tone: 'destructive' as const, icon: CircleAlert, title: t('errors.banner.processingTitle') }
    }
  }, [kind, t])

  if (!hasError) return null

  const Icon = visual.icon
  const detail = errorMeta?.message ?? error ?? t('errors.processingFailed')
  const showRetry = Boolean(onRetry && (errorMeta?.recoverable ?? true))

  return (
    <div className={cn('rounded-xl border px-3 py-2.5 motion-safe:animate-[shake_0.45s_var(--ease-out),section-in_0.3s_var(--ease-out)_both]', toneClassMap[visual.tone as BannerTone], className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Icon className="h-4 w-4 shrink-0" />
            <span>{visual.title}</span>
          </p>
          <p className="break-words text-xs text-muted-foreground">{detail}</p>
        </div>
        {showRetry ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={retrying}
            onClick={async () => {
              if (!onRetry) return
              setRetrying(true)
              try {
                await onRetry()
              } catch {
                // Retry errors are reflected by parent error state; avoid unhandled rejection noise.
              } finally {
                setRetrying(false)
              }
            }}
          >
            {retrying ? t('actions.processing') : t('errors.retry')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
