import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import type { HistoryEntry } from '../useComparisonHistory'

type Props = {
  entries: HistoryEntry[]
  onClear: () => void
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400'
  if (score >= 60) return 'text-amber-600 dark:text-amber-400'
  if (score >= 40) return 'text-orange-600 dark:text-orange-400'
  return 'text-rose-600 dark:text-rose-400'
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `${diffD}d ago`
  return d.toLocaleDateString()
}

export function ComparisonHistory({ entries, onClear }: Props) {
  const { t } = useTranslation('faceSimilarity')

  if (entries.length === 0) return null

  return (
    <div className="space-y-3 motion-safe:animate-fade-in">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {t('result.recentHistory')}
        </p>
        <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={onClear}>
          <Trash2 className="h-3 w-3 mr-1" />
          {t('result.clearHistory')}
        </Button>
      </div>
      <div className="space-y-2">
        {entries.slice(0, 5).map((entry) => (
          <div
            key={entry.id}
            className="flex items-center gap-3 rounded-lg border border-border/40 bg-muted/10 px-3 py-2"
          >
            <div className="flex items-center gap-1.5 shrink-0">
              {entry.thumb1 && (
                <div className="w-8 h-8 rounded-full overflow-hidden border border-border/50">
                  <img src={entry.thumb1} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              {entry.thumb2 && (
                <div className="w-8 h-8 rounded-full overflow-hidden border border-border/50">
                  <img src={entry.thumb2} alt="" className="w-full h-full object-cover" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs truncate">{entry.title}</p>
              <p className="text-[10px] text-muted-foreground">{formatTime(entry.timestamp)}</p>
            </div>
            <span className={`text-sm font-bold tabular-nums ${scoreColor(entry.overall_score)}`}>
              {entry.overall_score}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
