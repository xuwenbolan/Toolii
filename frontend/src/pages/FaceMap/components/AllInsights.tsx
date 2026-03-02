import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'

import type { InsightItem } from '@/services/faceMapApi'
import { cn } from '@/lib/utils'

function InsightAccordion({ item }: { item: InsightItem }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        className="flex w-full items-center justify-between p-3 text-left"
        onClick={() => setOpen(!open)}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{item.title}</p>
          <p className="text-xs text-muted-foreground">{item.brief}</p>
        </div>
        <ChevronDown className={cn('ml-2 h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="border-t px-3 pb-3 pt-2">
          <p className="text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
        </div>
      )}
    </div>
  )
}

export function AllInsights({ insights }: { insights: InsightItem[] }) {
  const { t } = useTranslation('faceMap')

  if (insights.length === 0) return null

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('report.insights')}
      </h3>
      <div className="space-y-2">
        {insights.map((item) => (
          <InsightAccordion key={item.type} item={item} />
        ))}
      </div>
    </div>
  )
}
