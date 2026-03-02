import { useTranslation } from 'react-i18next'
import { Check, X } from 'lucide-react'

import type { GlassesResult } from '@/services/faceMapApi'

export function GlassesCard({ data }: { data: GlassesResult }) {
  const { t } = useTranslation('faceMap')

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('report.glasses')}
      </h3>

      {data.recommended.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{t('report.glassesRecommend')}</p>
          {data.recommended.map((g) => (
            <div key={g.frame_id} className="flex items-start gap-2 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 p-2.5">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{g.name}</p>
                <p className="text-xs text-muted-foreground">{g.rationale}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {data.avoid.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{t('report.glassesAvoid')}</p>
          {data.avoid.map((g) => (
            <div key={g.frame_id} className="flex items-start gap-2 rounded-lg bg-rose-50/50 dark:bg-rose-950/20 p-2.5">
              <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{g.name}</p>
                <p className="text-xs text-muted-foreground">{g.rationale}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
