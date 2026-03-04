import type { ReactNode } from 'react'
import type { Payload, ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent'

// Palette CSS variables for chart data series
export const CHART_COLORS = [
  'var(--chart-palette-1)',
  'var(--chart-palette-2)',
  'var(--chart-palette-3)',
  'var(--chart-palette-4)',
  'var(--chart-palette-5)',
  'var(--chart-palette-6)',
] as const

// Shared CartesianGrid props for consistent styling
export const GRID_PROPS = {
  strokeDasharray: '3 3',
  stroke: 'var(--border)',
  strokeOpacity: 0.5,
  vertical: false,
} as const

// Custom Tooltip matching the app's popover theme
export function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: ReadonlyArray<Payload<ValueType, NameType>>
  label?: ReactNode
}) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-lg">
      <div className="mb-1.5 text-xs text-muted-foreground">{label}</div>
      <div className="space-y-1">
        {payload.map((entry: Payload<ValueType, NameType>) => (
          <div key={entry.dataKey as string} className="flex items-center gap-2 text-sm">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="ml-auto font-medium tabular-nums text-popover-foreground">
              {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Custom Legend with colored dots
export function ChartLegend({
  payload,
}: {
  payload?: Array<{ value: string; color: string }>
}) {
  if (!payload?.length) return null

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-2">
      {payload.map((entry) => (
        <div key={entry.value} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          {entry.value}
        </div>
      ))}
    </div>
  )
}
