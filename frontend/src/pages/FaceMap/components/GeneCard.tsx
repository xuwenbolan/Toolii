import { useTranslation } from 'react-i18next'

import type { GeneCard as GeneCardType } from '@/services/faceMapApi'

export function GeneCard({ data }: { data: GeneCardType }) {
  const { t } = useTranslation('faceMap')

  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-stone-100 via-amber-50/60 to-rose-50/40 dark:from-stone-900 dark:via-amber-950/30 dark:to-rose-950/20 p-5 shadow-sm">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40 [background:radial-gradient(circle_at_top_right,rgba(180,140,100,0.2),transparent_55%)]"
      />
      <div className="relative space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('profile.geneCard')}
        </h3>
        <p className="text-sm leading-relaxed">{data.description}</p>
        <div className="flex flex-wrap gap-1.5">
          {data.highlights.map((h) => (
            <span
              key={h}
              className="inline-block rounded-full bg-background/70 px-2.5 py-0.5 text-xs font-medium text-foreground backdrop-blur-sm"
            >
              {h}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
