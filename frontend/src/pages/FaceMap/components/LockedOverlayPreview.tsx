import { Lock, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

type Props = {
  onUnlock: () => void
  pending?: boolean
  disabled?: boolean
  creditHint?: string
}

export function LockedOverlayPreview({ onUnlock, pending, disabled, creditHint }: Props) {
  const { t } = useTranslation('faceMap')

  return (
    <div className="relative overflow-hidden rounded-xl border border-dashed border-primary/30 bg-gradient-to-br from-primary/[0.03] to-primary/[0.08]">
      {/* Blurred skeleton preview behind overlay */}
      <div aria-hidden="true" className="pointer-events-none select-none blur-[6px] opacity-50 space-y-3 p-4">
        {/* Hairstyle card skeleton */}
        <div className="rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 p-3 space-y-2">
          <div className="h-3 w-28 rounded bg-emerald-300/40 dark:bg-emerald-700/30" />
          <div className="space-y-1.5">
            <div className="h-10 w-full rounded-lg bg-emerald-200/30 dark:bg-emerald-800/20" />
            <div className="h-10 w-full rounded-lg bg-emerald-200/30 dark:bg-emerald-800/20" />
          </div>
        </div>
        {/* Eyebrow comparison skeleton */}
        <div className="rounded-lg bg-muted/40 p-3 space-y-2">
          <div className="h-3 w-24 rounded bg-muted-foreground/15" />
          <div className="grid grid-cols-2 gap-2">
            <div className="h-16 rounded-lg bg-muted/60" />
            <div className="h-16 rounded-lg bg-primary/5" />
          </div>
        </div>
        {/* Contouring guide skeleton */}
        <div className="rounded-lg bg-muted/40 p-3 space-y-2">
          <div className="h-3 w-28 rounded bg-muted-foreground/15" />
          <div className="flex gap-2">
            <div className="h-6 w-16 rounded-full bg-amber-200/30 dark:bg-amber-800/20" />
            <div className="h-6 w-16 rounded-full bg-stone-200/30 dark:bg-stone-800/20" />
            <div className="h-6 w-14 rounded-full bg-rose-200/30 dark:bg-rose-800/20" />
          </div>
          <div className="h-2 w-3/4 rounded bg-muted/50" />
        </div>
        {/* Glasses skeleton */}
        <div className="rounded-lg bg-muted/40 p-3 space-y-2">
          <div className="h-3 w-32 rounded bg-muted-foreground/15" />
          <div className="h-10 w-full rounded-lg bg-muted/50" />
        </div>
      </div>

      {/* Centered unlock CTA overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 sm:gap-4 bg-background/40 backdrop-blur-[2px] p-4 sm:p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Lock className="h-5 w-5 text-primary" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-base font-semibold">{t('locked.title')}</h3>
          <p className="text-sm text-muted-foreground">{t('locked.description')}</p>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-1.5">
          {(t('locked.features', { returnObjects: true }) as string[]).map((f) => (
            <span
              key={f}
              className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2.5 py-0.5 text-xs text-muted-foreground backdrop-blur-sm"
            >
              <Sparkles className="h-3 w-3 text-primary/60" />
              {f}
            </span>
          ))}
        </div>

        {creditHint && <p className="text-xs text-muted-foreground">{creditHint}</p>}

        <Button size="sm" disabled={pending || disabled} onClick={onUnlock}>
          {pending ? t('report.generating') : t('report.unlock')}
        </Button>
      </div>
    </div>
  )
}
