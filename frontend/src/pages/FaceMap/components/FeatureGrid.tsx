import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import type { FeatureReading } from '@/services/faceMapApi'

const FEATURE_KEYS = ['face_shape', 'eyes', 'nose', 'mouth', 'eyebrows', 'forehead', 'jawline', 'symmetry'] as const

function FeatureCard({
  label,
  feature,
  active,
  onClick,
}: {
  label: string
  feature: FeatureReading
  active: boolean
  onClick: () => void
}) {
  const barColor =
    feature.score >= 80
      ? 'bg-emerald-500'
      : feature.score >= 60
        ? 'bg-primary'
        : feature.score >= 40
          ? 'bg-amber-500'
          : 'bg-muted-foreground'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      className={cn(
        'cursor-pointer rounded-xl border bg-card p-3.5 space-y-2 h-full hover-lift-sm',
        active && 'ring-2 ring-primary border-primary/50 shadow-md',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs font-semibold text-muted-foreground tabular-nums">{feature.score}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${feature.score}%` }}
        />
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">{feature.label}</span> - {feature.description}
        {feature.secondary_label && (
          <span className="text-muted-foreground/70"> ({feature.secondary_label})</span>
        )}
      </p>
      {feature.beauty_tip && (
        <p className="text-xs leading-relaxed text-primary/80 italic">{feature.beauty_tip}</p>
      )}
    </div>
  )
}

type Props = {
  features: Record<string, FeatureReading>
  highlightedFeature?: string | null
  onFeatureClick?: (key: string | null) => void
}

export function FeatureGrid({ features, highlightedFeature, onFeatureClick }: Props) {
  const { t } = useTranslation('faceMap')

  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('profile.features')}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {FEATURE_KEYS.map((key) => {
          const feature = features[key]
          if (!feature) return null
          return (
            <FeatureCard
              key={key}
              label={t(`features.${key}`)}
              feature={feature}
              active={highlightedFeature === key}
              onClick={() => onFeatureClick?.(highlightedFeature === key ? null : key)}
            />
          )
        })}
      </div>
    </div>
  )
}
