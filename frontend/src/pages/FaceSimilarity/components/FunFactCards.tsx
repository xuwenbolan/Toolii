import { Lightbulb } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type Props = {
  facts: string[]
}

export function FunFactCards({ facts }: Props) {
  const { t } = useTranslation('faceSimilarity')

  if (facts.length === 0) return null

  return (
    <div className="space-y-2 motion-safe:animate-fade-in">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {t('result.funFacts')}
      </p>
      <div className="space-y-2">
        {facts.map((fact, i) => (
          <div
            key={i}
            className="flex items-start gap-2.5 rounded-lg border border-border/40 bg-muted/15 px-3.5 py-2.5"
          >
            <Lightbulb className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs sm:text-sm leading-relaxed">{fact}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
