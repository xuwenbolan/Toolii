import { useTranslation } from 'react-i18next'

import type { FunIndex } from '@/services/faceMapApi'

function CircularProgress({ percentile }: { percentile: number }) {
  const r = 20
  const circumference = 2 * Math.PI * r
  const offset = circumference - (percentile / 100) * circumference

  return (
    <svg width="48" height="48" className="-rotate-90">
      <circle cx="24" cy="24" r={r} fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/20" />
      <circle
        cx="24" cy="24" r={r}
        fill="none" stroke="currentColor" strokeWidth="3"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="text-primary transition-all duration-500"
      />
      <text
        x="24" y="24"
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-foreground text-[10px] font-semibold [transform:rotate(90deg)] [transform-origin:24px_24px]"
      >
        {percentile}
      </text>
    </svg>
  )
}

export function FunIndicesPanel({ indices }: { indices: FunIndex[] }) {
  const { t } = useTranslation('faceMap')

  if (indices.length === 0) return null

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('profile.funIndices')}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {indices.map((idx) => (
          <div key={idx.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
            <CircularProgress percentile={idx.percentile} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{idx.label}</p>
              <p className="text-xs text-muted-foreground line-clamp-2">{idx.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
