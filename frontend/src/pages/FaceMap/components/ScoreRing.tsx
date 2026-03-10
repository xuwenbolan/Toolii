import { useEffect, useRef, useState } from 'react'

const RADIUS = 40
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function ScoreRing({ score, size = 100 }: { score: number; size?: number }) {
  const [displayScore, setDisplayScore] = useState(0)
  const rafRef = useRef(0)

  // Animated count-up on mount / score change
  useEffect(() => {
    const start = performance.now()
    const duration = 800
    const animate = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayScore(Math.round(eased * score))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [score])

  const offset = CIRCUMFERENCE - (displayScore / 100) * CIRCUMFERENCE
  const gradientId = `score-grad-${size}`

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-20 h-20 sm:w-[100px] sm:h-[100px] -rotate-90">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--canvas-primary)" />
            <stop offset="60%" stopColor="var(--canvas-accent)" />
            <stop offset="100%" stopColor="var(--canvas-accent-end)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2} cy={size / 2} r={RADIUS}
          fill="none" stroke="currentColor" strokeWidth="6"
          className="text-muted/20"
        />
        <circle
          cx={size / 2} cy={size / 2} r={RADIUS}
          fill="none" stroke={`url(#${gradientId})`} strokeWidth="6"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-xl sm:text-2xl font-bold tabular-nums">{displayScore}</span>
    </div>
  )
}
