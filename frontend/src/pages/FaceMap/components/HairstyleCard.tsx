import { useTranslation } from 'react-i18next'
import { Check, X } from 'lucide-react'

import type { HairstyleResult } from '@/services/faceMapApi'

export function HairstyleCard({ data }: { data: HairstyleResult }) {
  const { t } = useTranslation('faceMap')

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('report.hairstyles')}
      </h3>

      {/* Recommended */}
      {data.recommended.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{t('report.hairstylesRecommend')}</p>
          {data.recommended.map((s) => (
            <div key={s.style_id} className="rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 p-3 space-y-1">
              <div className="flex items-start gap-2">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.rationale}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">{t('report.foreheadExposure')}</span>
                    <div className="h-1 w-16 rounded-full bg-muted">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${s.forehead_exposure * 100}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Avoid */}
      {data.avoid.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{t('report.hairstylesAvoid')}</p>
          {data.avoid.map((s) => (
            <div key={s.style_id} className="rounded-lg bg-rose-50/50 dark:bg-rose-950/20 p-3 space-y-1">
              <div className="flex items-start gap-2">
                <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.rationale}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
