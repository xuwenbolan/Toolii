import { useTranslation } from 'react-i18next'

import { Card, CardContent } from '@/components/ui/card'
import type { TextStats } from '@/lib/textCounter'
import { AnimatedCounter } from './AnimatedCounter'

type Props = { stats: TextStats }

export function StatsGrid({ stats }: Props) {
  const { t } = useTranslation('textTools')

  const items: { label: string; value: string | number; animate?: boolean }[] = [
    { label: t('stats.words'), value: stats.words, animate: true },
    { label: t('stats.characters'), value: stats.characters, animate: true },
    { label: t('stats.charactersNoSpaces'), value: stats.charactersNoSpaces, animate: true },
    { label: t('stats.cjkCharacters'), value: stats.cjkCharacters, animate: true },
    { label: t('stats.sentences'), value: stats.sentences, animate: true },
    { label: t('stats.paragraphs'), value: stats.paragraphs, animate: true },
    { label: t('stats.lines'), value: stats.lines, animate: true },
    {
      label: t('stats.readingTime'),
      value:
        stats.readingTimeMinutes < 1
          ? t('stats.lessThanOneMin')
          : t('stats.minutes', { count: Math.ceil(stats.readingTimeMinutes) }),
      animate: false,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="px-3 py-2.5 text-center">
            <div className="text-lg font-semibold tabular-nums">
              {typeof item.value === 'number' && item.animate ? (
                <AnimatedCounter value={item.value} />
              ) : (
                item.value
              )}
            </div>
            <div className="text-xs text-muted-foreground">{item.label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
