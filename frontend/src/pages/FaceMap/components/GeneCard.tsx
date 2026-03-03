import { useTranslation } from 'react-i18next'

import type { GeneCard as GeneCardType } from '@/services/faceMapApi'

export function GeneCard({ data }: { data: GeneCardType }) {
  const { t } = useTranslation('faceMap')

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-stone-100 via-amber-50/60 to-rose-50/40 dark:from-stone-900 dark:via-amber-950/30 dark:to-rose-950/20 p-5 shadow-sm">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40 [background:radial-gradient(circle_at_top_right,rgba(180,140,100,0.2),transparent_55%)]"
      />
      {/* Decorative blur accent */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-8 -right-8 h-28 w-28 rounded-full bg-amber-200/25 blur-2xl dark:bg-amber-700/10"
      />
      <div className="relative space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-800/60 dark:text-amber-400/60">
          {t('profile.geneCard')}
        </h3>
        <p className="text-[15px] leading-relaxed font-medium text-foreground/90">{data.description}</p>
        <div className="flex flex-wrap gap-1.5">
          {data.highlights.map((h) => (
            <span
              key={h}
              className="inline-block rounded-full bg-background/70 px-2.5 py-0.5 text-xs font-medium text-foreground shadow-sm backdrop-blur-sm"
            >
              {h}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
