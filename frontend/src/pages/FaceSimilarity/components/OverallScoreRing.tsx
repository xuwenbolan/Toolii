import { useEffect, useRef, useState } from 'react'
import { cssVar } from '@/lib/canvasColors'

const RADIUS = 52
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const SIZE = 140

function scoreColor(score: number): string {
  if (score >= 80) return cssVar('canvas-score-high')
  if (score >= 60) return cssVar('canvas-score-mid')
  if (score >= 40) return cssVar('canvas-score-low')
  return cssVar('canvas-score-poor')
}

export function OverallScoreRing({ score }: { score: number }) {
  const [display, setDisplay] = useState(0)
  const rafRef = useRef(0)

  useEffect(() => {
    const start = performance.now()
    const duration = 1000
    const animate = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(eased * score))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [score])

  const offset = CIRCUMFERENCE - (display / 100) * CIRCUMFERENCE
  const color = scoreColor(display)

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-28 h-28 sm:w-36 sm:h-36 -rotate-90">
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
          fill="none" stroke="currentColor" strokeWidth="8"
          className="text-muted/15"
        />
        <circle
          cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
          fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-1000 ease-out"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl sm:text-4xl font-bold tabular-nums">{display}</span>
        <span className="text-xs text-muted-foreground">%</span>
      </div>
    </div>
  )
}
