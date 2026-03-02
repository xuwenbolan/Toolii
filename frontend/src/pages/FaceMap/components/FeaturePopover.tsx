import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { FeatureReading } from '@/services/faceMapApi'

type Props = {
  featureKey: string
  feature: FeatureReading
  anchor?: { x: number; y: number }
  paidSummary?: { title: string; body: string } | null
  onClose: () => void
}

export function FeaturePopover({ featureKey, feature, anchor, paidSummary, onClose }: Props) {
  const { t } = useTranslation(['faceMap', 'common'])
  const [isMobile, setIsMobile] = useState(false)
  const x = Math.max(0.12, Math.min(0.88, anchor?.x ?? 0.5))
  const y = Math.max(0.12, Math.min(0.82, anchor?.y ?? 0.72))

  useEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia('(max-width: 1023px)')
    const update = () => setIsMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const barColor =
    feature.score >= 80
      ? 'bg-emerald-500'
      : feature.score >= 60
        ? 'bg-primary'
        : feature.score >= 40
          ? 'bg-amber-500'
          : 'bg-muted-foreground'

  const body = (
    <>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{t('profile.features')}</p>
          <p className="truncate text-sm font-semibold">{t(`features.${featureKey}`)}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={onClose}
          aria-label={t('common:actions.close')}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-medium">{feature.label}</span>
        <span className="tabular-nums text-muted-foreground">{feature.score}</span>
      </div>

      <div className="mb-2 h-1.5 w-full rounded-full bg-muted">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${feature.score}%` }} />
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">{feature.description}</p>
      {feature.beauty_tip && (
        <p className="mt-1.5 text-xs leading-relaxed text-primary/85">{feature.beauty_tip}</p>
      )}
      {paidSummary?.body && (
        <div className="mt-2 rounded-md border bg-muted/30 p-2">
          <p className="text-[11px] font-semibold text-foreground">{paidSummary.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{paidSummary.body}</p>
        </div>
      )}
    </>
  )

  if (isMobile) {
    return (
      <Sheet open onOpenChange={(open) => { if (!open) onClose() }}>
        <SheetContent side="bottom" className="rounded-t-2xl px-4 pb-5 pt-4">
          <SheetHeader className="sr-only">
            <SheetTitle>{t(`features.${featureKey}`)}</SheetTitle>
            <SheetDescription>{t('profile.features')}</SheetDescription>
          </SheetHeader>
          {body}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <div
      className="absolute z-20 w-[min(22rem,calc(100%-1rem))] rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur-sm"
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transform: 'translate(-50%, -108%)',
      }}
    >
      {body}
    </div>
  )
}
