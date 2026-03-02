import { useTranslation } from 'react-i18next'

import type { EyebrowSuggestion } from '@/services/faceMapApi'

export function EyebrowComparison({ data }: { data: EyebrowSuggestion }) {
  const { t } = useTranslation('faceMap')

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('report.eyebrows')}
      </h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-muted/30 p-3 space-y-1">
          <p className="text-[10px] font-medium uppercase text-muted-foreground">{t('report.eyebrowsCurrent')}</p>
          <p className="text-sm font-medium">{data.current_description}</p>
        </div>
        <div className="rounded-lg bg-primary/5 p-3 space-y-1">
          <p className="text-[10px] font-medium uppercase text-primary">{t('report.eyebrowsSuggested')}</p>
          <p className="text-sm font-medium">{data.suggested_description ?? data.suggested_type}</p>
          <p className="text-xs text-muted-foreground">{data.rationale}</p>
        </div>
      </div>

      {Object.keys(data.adjustments).length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium">{t('report.eyebrowsAdjustments')}</p>
          <div className="space-y-1">
            {Object.entries(data.adjustments).map(([key, val]) => (
              <div key={key} className="flex items-start gap-2 text-xs">
                <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-primary" />
                <span className="text-muted-foreground">
                  <span className="font-medium text-foreground">{t(`report.adjustmentKeys.${key}`, key)}:</span> {val}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
