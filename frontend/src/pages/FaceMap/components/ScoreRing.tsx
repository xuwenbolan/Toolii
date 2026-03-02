const RADIUS = 40
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function ScoreRing({ score, size = 100 }: { score: number; size?: number }) {
  const offset = CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-20 h-20 sm:w-[100px] sm:h-[100px] -rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={RADIUS}
          fill="none" stroke="currentColor" strokeWidth="6"
          className="text-muted/20"
        />
        <circle
          cx={size / 2} cy={size / 2} r={RADIUS}
          fill="none" stroke="currentColor" strokeWidth="6"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-primary transition-all duration-700"
        />
      </svg>
      <span className="absolute text-xl sm:text-2xl font-bold tabular-nums">{score}</span>
    </div>
  )
}
