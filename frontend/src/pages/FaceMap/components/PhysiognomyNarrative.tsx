import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Sparkles } from 'lucide-react'

import { cn } from '@/lib/utils'

type Props = {
  sections: Record<string, string>
  llmUsed: boolean
}

const SECTION_ORDER = [
  'three_courts',
  'five_eyes',
  'eyes',
  'nose',
  'mouth',
  'eyebrows',
  'forehead_jawline_mountains',
  'overall',
] as const

export function PhysiognomyNarrative({ sections, llmUsed }: Props) {
  const { t } = useTranslation('faceMap')
  const [expanded, setExpanded] = useState(false)

  const validSections = SECTION_ORDER.filter((k) => sections[k]?.trim())
  if (validSections.length === 0) return null

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          {t('report.physiognomy')}
        </h3>
        <span className="rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
          {t('report.physiognomyDisclaimer')}
        </span>
      </div>

      {!llmUsed && (
        <p className="text-[11px] text-muted-foreground italic">{t('physiognomy.templateBased')}</p>
      )}

      <button
        type="button"
        className="flex w-full items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-sm font-medium"
        onClick={() => setExpanded(!expanded)}
      >
        <span>{expanded ? t('physiognomy.collapse') : t('physiognomy.sectionCount', { count: validSections.length })}</span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
      </button>

      {expanded && (
        <div className="space-y-3">
          {validSections.map((key) => (
            <div key={key} className="space-y-1">
              <p className="text-xs font-semibold">{t(`physiognomy.sections.${key}`)}</p>
              <p className="text-xs leading-relaxed text-muted-foreground whitespace-pre-line">{sections[key]}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
