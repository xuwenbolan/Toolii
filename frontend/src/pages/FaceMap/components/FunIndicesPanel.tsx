import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import type { FunIndex } from '@/services/faceMapApi'

// Unique accent per index for visual variety
const INDEX_STYLE: Record<string, { stroke: string; bg: string }> = {
  age_defying: { stroke: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-950/20' },
  distinctiveness: { stroke: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/20' },
  photogenic: { stroke: 'text-rose-500', bg: 'bg-rose-50 dark:bg-rose-950/20' },
  approachability: { stroke: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/20' },
}

const FALLBACK_STYLE = { stroke: 'text-primary', bg: 'bg-muted/30' }

function CircularProgress({ percentile, colorClass }: { percentile: number; colorClass: string }) {
  const r = 22
  const circumference = 2 * Math.PI * r
  const offset = circumference - (percentile / 100) * circumference

  return (
    <svg width="56" height="56" className="-rotate-90">
      <circle cx="28" cy="28" r={r} fill="none" stroke="currentColor" strokeWidth="3.5" className="text-muted/20" />
      <circle
        cx="28" cy="28" r={r}
        fill="none" stroke="currentColor" strokeWidth="3.5"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className={cn(colorClass, 'transition-all duration-500')}
      />
      <text
        x="28" y="28"
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-foreground text-[11px] font-semibold [transform:rotate(90deg)] [transform-origin:28px_28px]"
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
      <div className="grid grid-cols-2 gap-3">
        {indices.map((idx) => {
          const style = INDEX_STYLE[idx.id] ?? FALLBACK_STYLE
          return (
            <div key={idx.id} className={cn('flex items-center gap-3 rounded-xl p-3 shadow-sm', style.bg)}>
              <CircularProgress percentile={idx.percentile} colorClass={style.stroke} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{idx.label}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">{idx.description}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
