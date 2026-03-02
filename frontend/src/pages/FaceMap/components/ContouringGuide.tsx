import { useTranslation } from 'react-i18next'

import type { ContouringResult } from '@/services/faceMapApi'

const ZONE_COLORS: Record<string, string> = {
  highlight: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  shadow: 'bg-stone-200 text-stone-800 dark:bg-stone-800/30 dark:text-stone-300',
  blush: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
}

export function ContouringGuide({ data }: { data: ContouringResult }) {
  const { t } = useTranslation('faceMap')

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('report.contouring')}
      </h3>
      <p className="text-sm text-muted-foreground">{data.description}</p>
      <div className="space-y-2">
        {data.zones.map((zone) => (
          <div key={zone.region_id} className="flex items-start gap-2">
            <span className={`mt-0.5 inline-block shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${ZONE_COLORS[zone.zone_type] ?? 'bg-muted text-muted-foreground'}`}>
              {t(`contouring.zoneTypes.${zone.zone_type}`, zone.zone_type)}
            </span>
            <p className="text-xs text-muted-foreground">{zone.tip}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
