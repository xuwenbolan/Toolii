import { MessageCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type Props = {
  narrative: string
}

export function NarrativeCard({ narrative }: Props) {
  const { t } = useTranslation('faceSimilarity')

  return (
    <div className="rounded-xl border border-border/50 bg-gradient-to-br from-muted/30 to-muted/10 p-4 sm:p-5 motion-safe:animate-fade-in">
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
          <MessageCircle className="h-4 w-4 text-primary" />
        </div>
        <div className="space-y-1 min-w-0">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {t('result.narrative')}
          </p>
          <p className="text-sm leading-relaxed">{narrative}</p>
        </div>
      </div>
    </div>
  )
}
