import type { AestheticsDimension } from '@/services/faceMapApi'

type Props = {
  dimensions: AestheticsDimension[]
  size?: number
}

export function AestheticsRadar({ dimensions, size = 180 }: Props) {
  const n = dimensions.length
  if (n < 3) return null

  const cx = size / 2
  const cy = size / 2
  const maxR = size * 0.32
  const levels = [0.33, 0.66, 1.0]
  const angleStep = (2 * Math.PI) / n
  const startAngle = -Math.PI / 2

  const pointAt = (i: number, r: number): [number, number] => {
    const angle = startAngle + i * angleStep
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)]
  }

  const gridPaths = levels.map((lv) => {
    const pts = Array.from({ length: n }, (_, i) => pointAt(i, maxR * lv))
    return pts.map((p) => `${p[0]},${p[1]}`).join(' ')
  })

  const dataPoints = dimensions.map((d, i) => pointAt(i, (d.score / 100) * maxR))
  const dataPath = dataPoints.map((p) => `${p[0]},${p[1]}`).join(' ')

  return (
    <div className="flex flex-col items-center gap-1">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-36 h-36 sm:w-44 sm:h-44 overflow-visible">
        {/* Grid polygons */}
        {gridPaths.map((pts, idx) => (
          <polygon key={idx} points={pts} fill="none" stroke="currentColor" className="text-muted/30" strokeWidth="0.8" />
        ))}

        {/* Axes */}
        {Array.from({ length: n }, (_, i) => {
          const [ex, ey] = pointAt(i, maxR)
          return <line key={i} x1={cx} y1={cy} x2={ex} y2={ey} stroke="currentColor" className="text-muted/25" strokeWidth="0.8" />
        })}

        {/* Data polygon */}
        <polygon
          points={dataPath}
          fill="currentColor"
          className="text-primary/20"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {dataPoints.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="currentColor" className="text-primary" />
        ))}

        {/* Labels */}
        {dimensions.map((d, i) => {
          const [lx, ly] = pointAt(i, maxR + 18)
          return (
            <text
              key={d.id}
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-muted-foreground text-[10px]"
            >
              {d.label}
            </text>
          )
        })}
      </svg>
    </div>
  )
}
