import { useEffect, useRef, useState } from 'react'
import { Eye, CircleDot, Smile, Hexagon, User, Crown, TrendingDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const REGION_ICONS: Record<string, typeof Eye> = {
  eyes: Eye,
  nose: CircleDot,
  mouth: Smile,
  jawline: Hexagon,
  overall_face: User,
}

function barColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 60) return 'bg-amber-500'
  if (score >= 40) return 'bg-orange-500'
  return 'bg-rose-500'
}

type Props = {
  region: string
  label: string
  score: number
  description: string | null
  badge?: string | null
  delay?: number
}

export function RegionBar({ region, label, score, description, badge, delay = 0 }: Props) {
  const { t } = useTranslation('faceSimilarity')
  const [width, setWidth] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    timerRef.current = setTimeout(() => setWidth(score), delay)
    return () => clearTimeout(timerRef.current)
  }, [score, delay])

  const Icon = REGION_ICONS[region] ?? User

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium flex-1">{label}</span>
        {badge === 'best_match' && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded-full px-1.5 py-0.5">
            <Crown className="h-3 w-3" />
            {t('result.bestMatch')}
          </span>
        )}
        {badge === 'least_match' && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 rounded-full px-1.5 py-0.5">
            <TrendingDown className="h-3 w-3" />
            {t('result.leastMatch')}
          </span>
        )}
        <span className="text-sm font-bold tabular-nums w-10 text-right">{score}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-muted/30 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${barColor(score)}`}
          style={{ width: `${width}%` }}
        />
      </div>
      {description && (
        <p className="text-xs text-muted-foreground pl-6">{description}</p>
      )}
    </div>
  )
}
