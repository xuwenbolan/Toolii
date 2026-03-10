import { useState, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Thermometer,
  HardDrive,
  Clock,
  CircleSlash,
  X,
} from 'lucide-react'

import { AdminErrorState, DataTable, StatusBadge } from '@/components/admin'
import type { Column } from '@/components/admin'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  fetchCortexStatus,
  checkCortexModels,
  checkCortexModel,
  unloadAllCortexModels,
  unloadCortexModel,
  enableCortexModel,
  disableCortexModel,
  fetchCortexTimeline,
} from '@/services/adminApi'
import type {
  CortexModelItem,
  CortexModelCheckResult,
  CortexModelEvent,
  CortexVramSample,
  CortexGpuInfo,
  CortexModelsSummary,
  CortexQueueInfo,
} from '@/services/adminApi'

// -- Status & event color maps --

const MODEL_STATUS_COLORS: Record<string, string> = {
  loaded: 'bg-success-light text-success border-success/20',
  available: 'bg-info-light text-info border-info/20',
  disabled: 'bg-muted text-muted-foreground border-border',
  missing: 'bg-destructive-light text-destructive border-destructive/20',
}

const EVENT_COLORS: Record<string, string> = {
  loaded: 'bg-success-light text-success border-success/20',
  evicted_lru: 'bg-warning-light text-warning border-warning/20',
  evicted_idle: 'bg-warning-light text-warning border-warning/20',
  evicted_budget: 'bg-warning-light text-warning border-warning/20',
  evicted_workspace: 'bg-warning-light text-warning border-warning/20',
  oom_retry: 'bg-destructive-light text-destructive border-destructive/20',
  disabled: 'bg-muted text-muted-foreground border-border',
}

// -- Format helpers --

function formatMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb} MB`
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatIdleTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

function formatRelativeTime(timestamp: number): string {
  const delta = Math.floor(Date.now() / 1000 - timestamp)
  if (delta < 60) return `${delta}s ago`
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`
  return `${Math.floor(delta / 86400)}d ago`
}

function formatEventTime(timestamp: number): string {
  const d = new Date(timestamp * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// -- Ring Gauge (SVG) --

function RingGauge({
  value,
  max,
  label,
  unit,
  warningThreshold,
  criticalThreshold,
  size = 64,
}: {
  value: number
  max: number
  label: string
  unit: string
  warningThreshold: number
  criticalThreshold: number
  size?: number
}) {
  const r = (size - 8) / 2
  const circumference = 2 * Math.PI * r
  const pct = max > 0 ? Math.min(value / max, 1) : 0
  const offset = circumference * (1 - pct)

  let strokeColor = 'var(--foreground)'
  let strokeOpacity = 0.7
  if (value >= criticalThreshold) {
    strokeColor = 'var(--destructive)'
    strokeOpacity = 1
  } else if (value >= warningThreshold) {
    strokeColor = 'var(--warning)'
    strokeOpacity = 1
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke="var(--muted)" strokeWidth={4}
          />
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke={strokeColor} strokeOpacity={strokeOpacity}
            strokeWidth={4} strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-semibold">{value}</span>
          <span className="text-[10px] text-muted-foreground">{unit}</span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

// -- VRAM Stacked Bar --

function VramStackedBar({
  gpu,
  summary,
}: {
  gpu: CortexGpuInfo
  summary: CortexModelsSummary
}) {
  const { t } = useTranslation('console')
  const total = gpu.vram_total_mb
  if (total <= 0) return null

  const modelsMb = summary.vram_estimated_mb
  const otherMb = Math.max(0, gpu.vram_used_mb - modelsMb)
  const freeMb = Math.max(0, total - gpu.vram_used_mb)

  const modelsPct = (modelsMb / total) * 100
  const otherPct = (otherMb / total) * 100
  const usedPct = Math.round(((modelsMb + otherMb) / total) * 100)

  const budgetPct = summary.vram_budget_mb > 0
    ? Math.round(summary.vram_utilization * 100)
    : 0

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-1">
          <span className="text-lg font-semibold">{formatMB(gpu.vram_used_mb)}</span>
          <span className="text-sm text-muted-foreground">/ {formatMB(total)}</span>
        </div>
        <span className="text-sm text-muted-foreground">{usedPct}%</span>
      </div>

      {/* Stacked bar */}
      <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-foreground transition-all"
          style={{ width: `${modelsPct}%` }}
          title={`${t('system.vramModels')}: ${formatMB(modelsMb)}`}
        />
        <div
          className="h-full bg-muted-foreground/50 transition-all"
          style={{ width: `${otherPct}%` }}
          title={`${t('system.vramOther')}: ${formatMB(otherMb)}`}
        />
      </div>

      {/* Legend */}
      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-foreground" />
          {t('system.vramModels')} {formatMB(modelsMb)}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-muted-foreground/50" />
          {t('system.vramOther')} {formatMB(otherMb)}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-muted" />
          {formatMB(freeMb)}
        </span>
      </div>

      {/* Budget line */}
      <div className="mt-1.5 text-xs text-muted-foreground">
        {t('system.vramBudget')}: {formatMB(summary.vram_estimated_mb)} / {formatMB(summary.vram_budget_mb)} ({budgetPct}%)
        <span className="ml-2">&middot; {summary.loaded} / {summary.registered} {t('system.modelsLoaded')}</span>
      </div>
    </div>
  )
}

// -- Queue Live Indicator --

function QueueIndicator({ queue }: { queue: CortexQueueInfo }) {
  const { t } = useTranslation('console')
  const max = queue.max_concurrent
  const active = queue.active
  const isSaturated = active >= max

  let statusText = t('system.queueIdle')
  let statusClass = 'text-muted-foreground'
  if (isSaturated) {
    statusText = t('system.queueSaturated')
    statusClass = 'text-destructive'
  } else if (active > 0) {
    statusText = t('system.queueProcessing')
    statusClass = 'text-foreground'
  }

  return (
    <div>
      <div className="flex items-baseline gap-1">
        <span className="text-lg font-semibold">{active}</span>
        <span className="text-sm text-muted-foreground">/ {max}</span>
        <span className="ml-2 text-sm text-muted-foreground">
          {t('system.queueTimeout')}: {queue.timeout_seconds}s
        </span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <svg width={max * 18 + 4} height={16} className="shrink-0">
          {Array.from({ length: max }, (_, i) => {
            const filled = i < active
            const cx = 8 + i * 18
            if (isSaturated) {
              return <circle key={i} cx={cx} cy={8} r={5} fill="var(--destructive)" />
            }
            if (filled) {
              return (
                <circle key={i} cx={cx} cy={8} r={5} fill="var(--foreground)">
                  <animate
                    attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite"
                    media="(prefers-reduced-motion: no-preference)"
                  />
                </circle>
              )
            }
            return (
              <circle key={i} cx={cx} cy={8} r={4.5}
                fill="none" stroke="var(--muted-foreground)" strokeWidth={1} />
            )
          })}
        </svg>
        <span className={`text-xs ${statusClass}`}>{statusText}</span>
      </div>
    </div>
  )
}

// -- Alert bar --

type AlertLevel = 'info' | 'warning' | 'critical'
type AlertItem = { key: string; level: AlertLevel; icon: React.ReactNode; message: string }

const ALERT_STYLES: Record<AlertLevel, string> = {
  info: 'border-info/20 bg-info-light text-info',
  warning: 'border-warning/20 bg-warning-light text-warning',
  critical: 'border-destructive/20 bg-destructive-light text-destructive',
}

function computeAlerts(
  gpu: CortexGpuInfo,
  modelList: CortexModelItem[],
  events: CortexModelEvent[],
  queue: CortexQueueInfo | undefined,
  t: (key: string, vars?: Record<string, unknown>) => string,
): AlertItem[] {
  const alerts: AlertItem[] = []

  // Temperature
  if (gpu.temperature_c != null && gpu.temperature_c >= 90) {
    alerts.push({
      key: 'temp-critical',
      level: 'critical',
      icon: <Thermometer className="h-4 w-4" />,
      message: t('system.alertTempHigh', { temp: `${gpu.temperature_c}C`, threshold: '90C' }),
    })
  } else if (gpu.temperature_c != null && gpu.temperature_c >= 80) {
    alerts.push({
      key: 'temp-warn',
      level: 'warning',
      icon: <Thermometer className="h-4 w-4" />,
      message: t('system.alertTempHigh', { temp: `${gpu.temperature_c}C`, threshold: '80C' }),
    })
  }

  // VRAM utilization (budget-based)
  const budgetPct = gpu.vram_total_mb > 0
    ? Math.round((gpu.vram_used_mb / gpu.vram_total_mb) * 100)
    : 0
  if (budgetPct >= 90) {
    alerts.push({
      key: 'vram-high',
      level: 'warning',
      icon: <HardDrive className="h-4 w-4" />,
      message: t('system.alertVramHigh', { pct: budgetPct }),
    })
  }

  // Missing required models
  const missingRequired = modelList.filter(m => m.status === 'missing' && m.required)
  if (missingRequired.length > 0) {
    alerts.push({
      key: 'missing-models',
      level: 'critical',
      icon: <AlertTriangle className="h-4 w-4" />,
      message: t('system.alertMissingModels', { count: missingRequired.length }),
    })
  }

  // OOM retries in recent events
  const recentOom = events.some(e => e.event === 'oom_retry')
  if (recentOom) {
    alerts.push({
      key: 'oom-retries',
      level: 'warning',
      icon: <AlertTriangle className="h-4 w-4" />,
      message: t('system.alertOomRetries'),
    })
  }

  // Queue saturated
  if (queue && queue.active >= queue.max_concurrent) {
    alerts.push({
      key: 'queue-full',
      level: 'info',
      icon: <Clock className="h-4 w-4" />,
      message: t('system.alertQueueFull'),
    })
  }

  // Disabled models
  const disabledCount = modelList.filter(m => !m.enabled).length
  if (disabledCount > 0) {
    alerts.push({
      key: 'disabled-models',
      level: 'info',
      icon: <CircleSlash className="h-4 w-4" />,
      message: t('system.alertDisabledModels', { count: disabledCount }),
    })
  }

  return alerts
}

// -- VRAM Timeline interactive chart (wheel zoom + drag pan) --

const TL_W = 600
const TL_H = 224
const TL_PX = 44
const TL_PR = 12
const TL_PT = 14
const TL_PB = 28
const TL_CW = TL_W - TL_PX - TL_PR
const TL_CH = TL_H - TL_PT - TL_PB
const TL_MIN_SPAN = 30
const TL_ZOOM_FACTOR = 1.4
const TL_TICK_STEPS = [5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600, 7200, 14400, 28800, 43200, 86400]

function VramTimelineChart({ samples, vramTotal }: { samples: CortexVramSample[]; vramTotal: number }) {
  const { t } = useTranslation('console')
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [view, setView] = useState<{ start: number; end: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const dataStart = samples.length > 1 ? samples[0].t : 0
  const dataEnd = samples.length > 1 ? samples[samples.length - 1].t : 1
  const dataRange = dataEnd - dataStart || 1

  const defaultSpan = Math.min(300, dataRange)
  const vEnd = view ? view.end : dataEnd
  const vStart = view ? view.start : Math.max(dataStart, dataEnd - defaultSpan)
  const vSpan = vEnd - vStart || 1

  const viewRef = useRef({ start: vStart, end: vEnd, span: vSpan })
  const boundsRef = useRef({ start: dataStart, end: dataEnd, range: dataRange })
  useEffect(() => {
    viewRef.current = { start: vStart, end: vEnd, span: vSpan }
    boundsRef.current = { start: dataStart, end: dataEnd, range: dataRange }
  })

  const visible = useMemo(() => {
    if (samples.length < 2) return []
    const m = vSpan * 0.02
    return samples.filter(s => s.t >= vStart - m && s.t <= vEnd + m)
  }, [samples, vStart, vEnd, vSpan])

  const hasData = samples.length >= 2
  useEffect(() => {
    const svg = svgRef.current
    if (!svg || !hasData) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const v = viewRef.current
      const b = boundsRef.current
      const rect = svg.getBoundingClientRect()
      const svgX = ((e.clientX - rect.left) / rect.width) * TL_W
      const frac = Math.max(0, Math.min(1, (svgX - TL_PX) / TL_CW))
      const mouseT = v.start + frac * v.span
      const factor = e.deltaY > 0 ? TL_ZOOM_FACTOR : 1 / TL_ZOOM_FACTOR
      const newSpan = Math.max(TL_MIN_SPAN, Math.min(b.range, v.span * factor))
      let s = mouseT - frac * newSpan
      let en = s + newSpan
      if (s < b.start) { s = b.start; en = s + newSpan }
      if (en > b.end + 5) { en = b.end + 5; s = en - newSpan }
      setView({ start: s, end: en })
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [hasData])

  if (!hasData) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        {t('system.noTimelineData')}
      </div>
    )
  }

  let yDataMin = Infinity, yDataMax = -Infinity
  for (const s of visible) {
    if (s.vram_used_mb < yDataMin) yDataMin = s.vram_used_mb
    if (s.vram_used_mb > yDataMax) yDataMax = s.vram_used_mb
  }
  if (!isFinite(yDataMin)) { yDataMin = 0; yDataMax = vramTotal }
  const ySpan = yDataMax - yDataMin || yDataMax * 0.2 || 512
  const ym = ySpan * 0.25
  const yMin = Math.max(0, Math.floor((yDataMin - ym) / 128) * 128)
  const yMax = Math.min(vramTotal, Math.ceil((yDataMax + ym) / 128) * 128)
  const yRange = yMax - yMin || 1

  const toX = (tv: number) => TL_PX + ((tv - vStart) / vSpan) * TL_CW
  const toY = (mb: number) => TL_PT + TL_CH - ((mb - yMin) / yRange) * TL_CH

  const vramPoints = visible.map(s => `${toX(s.t)},${toY(s.vram_used_mb)}`).join(' ')
  const eventSamples = visible.filter(s => s.event)
  const yMid = Math.round((yMin + yMax) / 2)
  const yLabels = [yMin, yMid, yMax]

  const tickStep = TL_TICK_STEPS.find(s => s >= vSpan / 5) ?? 86400
  const xTicks: number[] = []
  for (let tv = Math.ceil(vStart / tickStep) * tickStep; tv <= vEnd; tv += tickStep) xTicks.push(tv)

  const fmtMb = (mb: number) => mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${mb}M`
  const fmtTickTime = (ts: number) => {
    const d = new Date(ts * 1000)
    const p = (n: number) => String(n).padStart(2, '0')
    if (vSpan < 600) return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    if (vSpan < 21600) return `${p(d.getHours())}:${p(d.getMinutes())}`
    return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  }
  const fmtTooltipTime = (ts: number) => {
    const d = new Date(ts * 1000)
    const p = (n: number) => String(n).padStart(2, '0')
    const time = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    return vSpan >= 21600 ? `${p(d.getMonth() + 1)}/${p(d.getDate())} ${time}` : time
  }
  const fmtSpan = (sec: number) => {
    if (sec < 120) return `${Math.round(sec)}s`
    if (sec < 7200) return `${Math.round(sec / 60)}m`
    return `${(sec / 3600).toFixed(1)}h`
  }

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    const rect = svgRef.current!.getBoundingClientRect()
    const chartScreenW = rect.width * TL_CW / TL_W
    const v = viewRef.current
    const startX = e.clientX
    setIsDragging(true)
    setHoverIdx(null)

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX
      const dt = (dx / chartScreenW) * v.span
      const b = boundsRef.current
      let s = v.start - dt
      let en = v.end - dt
      if (s < b.start) { s = b.start; en = s + v.span }
      if (en > b.end + 5) { en = b.end + 5; s = en - v.span }
      setView({ start: s, end: en })
    }
    const onUp = () => {
      setIsDragging(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isDragging) return
    const rect = e.currentTarget.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * TL_W
    const tv = vStart + ((svgX - TL_PX) / TL_CW) * vSpan
    let best = 0, bestDist = Infinity
    for (let i = 0; i < visible.length; i++) {
      const dist = Math.abs(visible[i].t - tv)
      if (dist < bestDist) { bestDist = dist; best = i }
    }
    setHoverIdx(best)
  }

  const hovered = !isDragging && hoverIdx !== null && hoverIdx < visible.length ? visible[hoverIdx] : null

  return (
    <div className="relative select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${TL_W} ${TL_H}`}
        className="w-full"
        preserveAspectRatio="xMidYMid meet"
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => !isDragging && setHoverIdx(null)}
        onDoubleClick={() => setView(null)}
      >
        {yLabels.map(mb => (
          <g key={mb}>
            <line x1={TL_PX} y1={toY(mb)} x2={TL_W - TL_PR} y2={toY(mb)}
              stroke="var(--border)" strokeOpacity={0.5} strokeDasharray="3 3" />
            <text x={TL_PX - 6} y={toY(mb) + 4} textAnchor="end"
              fill="currentColor" fillOpacity={0.5} fontSize={11} fontFamily="var(--font-mono)">
              {fmtMb(mb)}
            </text>
          </g>
        ))}

        {xTicks.map(tv => (
          <g key={tv}>
            <line x1={toX(tv)} y1={TL_PT + TL_CH} x2={toX(tv)} y2={TL_PT + TL_CH + 4}
              stroke="currentColor" strokeOpacity={0.3} />
            <text x={toX(tv)} y={TL_H - 6} textAnchor="middle"
              fill="currentColor" fillOpacity={0.4} fontSize={9} fontFamily="var(--font-mono)">
              {fmtTickTime(tv)}
            </text>
          </g>
        ))}

        {visible.length >= 2 && (
          <polygon
            points={`${toX(visible[0].t)},${toY(yMin)} ${vramPoints} ${toX(visible[visible.length - 1].t)},${toY(yMin)}`}
            fill="var(--chart-palette-1)" fillOpacity={0.12}
          />
        )}

        {visible.length >= 2 && (
          <polyline points={vramPoints} fill="none" stroke="var(--chart-palette-1)" strokeWidth={1.5} />
        )}

        {eventSamples.map((s, i) => (
          <circle key={i} cx={toX(s.t)} cy={toY(s.vram_used_mb)} r={3} fill="var(--chart-palette-3)">
            <title>{s.event}</title>
          </circle>
        ))}

        {hovered && (
          <>
            <line x1={toX(hovered.t)} y1={TL_PT} x2={toX(hovered.t)} y2={TL_PT + TL_CH}
              stroke="currentColor" strokeOpacity={0.3} strokeWidth={1} strokeDasharray="3,2" />
            <circle cx={toX(hovered.t)} cy={toY(hovered.vram_used_mb)}
              r={3.5} fill="var(--chart-palette-1)" stroke="var(--background)" strokeWidth={1.5} />
          </>
        )}

        <text x={TL_W - TL_PR} y={TL_PT + 10} textAnchor="end"
          fill="currentColor" fillOpacity={0.35} fontSize={10} fontFamily="var(--font-mono)">
          {fmtSpan(vSpan)}
        </text>
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute top-1 rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${(toX(hovered.t) / TL_W) * 100}%`,
            transform: toX(hovered.t) > TL_W * 0.7 ? 'translateX(-100%)' : 'translateX(0)',
          }}
        >
          <div className="font-mono text-muted-foreground">{fmtTooltipTime(hovered.t)}</div>
          <div>VRAM: <span className="font-semibold">{formatMB(hovered.vram_used_mb)}</span> / {formatMB(vramTotal)}</div>
          <div>RAM: {formatMB(hovered.sys_ram_mb)}</div>
          <div>Models: {hovered.models}</div>
          {hovered.event && <div className="text-warning">{hovered.event}</div>}
        </div>
      )}
    </div>
  )
}


// =======================================================================
// Main Page
// =======================================================================

export function AdminSystemPage() {
  const { t } = useTranslation('console')
  const queryClient = useQueryClient()
  const [checkResults, setCheckResults] = useState<Record<string, CortexModelCheckResult>>({})
  const [checkingModel, setCheckingModel] = useState<string | null>(null)
  const [checkingAll, setCheckingAll] = useState(false)
  const [unloadingModel, setUnloadingModel] = useState<string | null>(null)
  const [togglingModel, setTogglingModel] = useState<string | null>(null)
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set())
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'cortex-status'],
    queryFn: fetchCortexStatus,
    refetchInterval: 30_000,
  })

  const { data: timeline } = useQuery({
    queryKey: ['admin', 'cortex-timeline'],
    queryFn: () => fetchCortexTimeline(0),
    refetchInterval: 60_000,
    enabled: data?.online === true,
  })

  const online = data?.online ?? false
  const health = data?.health
  const models = data?.models
  const gpu = models?.gpu
  const summary = models?.summary
  const modelList = useMemo(() => models?.models ?? [], [models?.models])
  const events = useMemo(() => models?.events ?? [], [models?.events])
  const inferenceStats = models?.inference_stats ?? {}
  const queue = health?.queue
  const sharedMemoryWarning = health?.shared_memory_warning ?? false
  const uptime = models?.uptime_seconds ?? 0

  // Compute alerts
  const alerts = useMemo(() => {
    if (!online || !gpu) return []
    return computeAlerts(gpu, modelList, events, queue, t)
      .filter(a => !dismissedAlerts.has(a.key))
  }, [online, gpu, modelList, events, queue, t, dismissedAlerts])

  const handleRefresh = () => {
    setCheckResults({})
    queryClient.invalidateQueries({ queryKey: ['admin', 'cortex-status'] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'cortex-timeline'] })
  }

  const handleCheckAll = async () => {
    setCheckingAll(true)
    try {
      const result = await checkCortexModels()
      if (result.models) {
        const map: Record<string, CortexModelCheckResult> = {}
        for (const m of result.models) map[m.name] = m
        setCheckResults(map)
      }
    } catch {
      toast.error(t('common.error'))
    } finally {
      setCheckingAll(false)
    }
  }

  const handleCheckModel = async (name: string) => {
    setCheckingModel(name)
    try {
      const result = await checkCortexModel(name)
      setCheckResults(prev => ({ ...prev, [name]: result }))
    } catch {
      toast.error(t('common.error'))
    } finally {
      setCheckingModel(null)
    }
  }

  const handleUnloadAll = async () => {
    try {
      await unloadAllCortexModels()
      toast.success(t('system.unloadAllSuccess'))
      handleRefresh()
    } catch {
      toast.error(t('common.error'))
    }
  }

  const handleUnloadModel = async (name: string) => {
    setUnloadingModel(name)
    try {
      await unloadCortexModel(name)
      toast.success(t('system.unloadSuccess'))
      handleRefresh()
    } catch {
      toast.error(t('common.error'))
    } finally {
      setUnloadingModel(null)
    }
  }

  const handleToggleModel = async (name: string, enable: boolean) => {
    setTogglingModel(name)
    try {
      if (enable) {
        await enableCortexModel(name)
        toast.success(t('system.enableSuccess'))
      } else {
        await disableCortexModel(name)
        toast.success(t('system.disableSuccess'))
      }
      handleRefresh()
    } catch {
      toast.error(t('common.error'))
    } finally {
      setTogglingModel(null)
    }
  }

  if (isError) return <AdminErrorState onRetry={() => refetch()} />

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        {t('common.loading')}
      </div>
    )
  }

  // -- Model table columns --

  const modelColumns: Column<CortexModelItem>[] = [
    {
      key: 'name',
      header: t('system.model'),
      render: (row) => (
        <span className={`font-mono text-sm ${!row.enabled ? 'opacity-50' : ''}`}>{row.name}</span>
      ),
    },
    {
      key: 'enabled',
      header: t('system.enabled'),
      render: (row) => {
        if (row.required) {
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Switch checked={true} disabled />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('system.requiredCannotDisable')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        }

        if (row.enabled) {
          // Disabling: show AlertDialog confirmation
          return (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <div>
                  <Switch
                    checked={true}
                    disabled={togglingModel === row.name}
                    onCheckedChange={() => {/* handled by AlertDialog */}}
                  />
                </div>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('system.confirmDisableTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('system.confirmDisableDesc', { model: row.name })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('system.cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => handleToggleModel(row.name, false)}
                  >
                    {t('system.confirm')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )
        }

        // Enabling: no confirmation needed
        return (
          <Switch
            checked={false}
            disabled={togglingModel === row.name}
            onCheckedChange={() => handleToggleModel(row.name, true)}
          />
        )
      },
    },
    {
      key: 'status',
      header: t('system.status'),
      render: (row) => {
        const check = checkResults[row.name]
        return (
          <div className={`flex items-center gap-2 ${!row.enabled ? 'opacity-50' : ''}`}>
            <StatusBadge
              status={row.status}
              colorMap={MODEL_STATUS_COLORS}
              label={t(`system.modelStatus.${row.status}`)}
            />
            {check && (
              <span className={check.healthy ? 'text-success text-xs' : 'text-destructive text-xs'}>
                {check.healthy ? t('system.healthy') : check.error ?? t('system.unhealthy')}
              </span>
            )}
          </div>
        )
      },
    },
    {
      key: 'required',
      header: t('system.required'),
      hiddenOnMobile: true,
      render: (row) => (
        <span className={`text-sm ${!row.enabled ? 'opacity-50' : ''}`}>
          {row.required ? t('system.yes') : t('system.no')}
        </span>
      ),
    },
    {
      key: 'vram_mb',
      header: 'VRAM',
      align: 'right',
      render: (row) => (
        <span className={`text-sm ${!row.enabled ? 'opacity-50' : ''}`}>{formatMB(row.vram_mb)}</span>
      ),
    },
    {
      key: 'vram_delta',
      header: t('system.vramDelta'),
      align: 'right',
      hiddenOnMobile: true,
      render: (row) => (
        <span className={`text-sm ${!row.enabled ? 'opacity-50' : ''}`}>
          {row.vram_delta_mb != null ? formatMB(row.vram_delta_mb) : '-'}
        </span>
      ),
    },
    {
      key: 'workspace',
      header: t('system.workspace'),
      align: 'right',
      hiddenOnMobile: true,
      render: (row) => (
        <span className={`text-sm ${!row.enabled ? 'opacity-50' : ''}`}>
          {row.workspace_measured_mb != null
            ? formatMB(row.workspace_measured_mb)
            : row.workspace_mb > 0
              ? `~${formatMB(row.workspace_mb)}`
              : '-'}
        </span>
      ),
    },
    {
      key: 'inference_count',
      header: t('system.inferenceCount'),
      align: 'right',
      hiddenOnMobile: true,
      render: (row) => (
        <span className={`text-sm ${!row.enabled ? 'opacity-50' : ''}`}>
          {row.inference_count != null ? row.inference_count : '-'}
        </span>
      ),
    },
    {
      key: 'file_size',
      header: t('system.fileSize'),
      align: 'right',
      hiddenOnMobile: true,
      render: (row) => (
        <span className={`text-sm ${!row.enabled ? 'opacity-50' : ''}`}>
          {row.file_size_mb != null ? formatMB(row.file_size_mb) : '-'}
        </span>
      ),
    },
    {
      key: 'loaded_at',
      header: t('system.loadedAt'),
      align: 'right',
      hiddenOnMobile: true,
      render: (row) => (
        <span className={`text-sm ${!row.enabled ? 'opacity-50' : ''}`}>
          {row.loaded_at != null ? formatRelativeTime(row.loaded_at) : '-'}
        </span>
      ),
    },
    {
      key: 'idle',
      header: t('system.idle'),
      align: 'right',
      hiddenOnMobile: true,
      render: (row) => (
        <span className={`text-sm ${!row.enabled ? 'opacity-50' : ''}`}>
          {row.idle_seconds != null ? formatIdleTime(row.idle_seconds) : '-'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          {/* Unload button: only for loaded models */}
          {row.status === 'loaded' && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={unloadingModel === row.name}
                >
                  {unloadingModel === row.name ? '...' : t('system.unload')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('system.confirmUnloadTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('system.confirmUnloadDesc', { model: row.name })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('system.cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => handleUnloadModel(row.name)}
                  >
                    {t('system.confirm')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {/* Check button */}
          <Button
            variant="outline"
            size="sm"
            disabled={checkingModel === row.name || !online}
            onClick={() => handleCheckModel(row.name)}
          >
            {checkingModel === row.name ? '...' : t('system.check')}
          </Button>
        </div>
      ),
    },
  ]

  // -- Inference stats with error rate --

  const inferenceEntries = Object.entries(inferenceStats).map(([ep, s]) => ({
    endpoint: ep,
    ...s,
  }))

  type InferenceRow = (typeof inferenceEntries)[number]

  const inferenceColumns: Column<InferenceRow>[] = [
    {
      key: 'endpoint',
      header: t('system.endpoint'),
      render: (row) => <span className="font-mono text-sm">{row.endpoint}</span>,
    },
    {
      key: 'calls',
      header: t('system.calls'),
      align: 'right',
      render: (row) => <span className="text-sm">{row.calls}</span>,
    },
    {
      key: 'errors',
      header: t('system.errors'),
      align: 'right',
      render: (row) => {
        const rate = row.calls > 0 ? (row.errors / row.calls) * 100 : 0
        let rateClass = ''
        if (rate > 20) rateClass = 'text-destructive'
        else if (rate > 5) rateClass = 'text-warning'
        else if (row.errors > 0) rateClass = 'text-destructive'

        return (
          <span className={`text-sm ${rateClass}`}>
            {row.errors}
            {row.errors > 0 && row.calls > 0 && (
              <span className="ml-1 text-xs">({rate.toFixed(1)}%)</span>
            )}
          </span>
        )
      },
    },
    {
      key: 'avg_ms',
      header: t('system.avgLatency'),
      align: 'right',
      render: (row) => (
        <span className="text-sm">
          {row.avg_ms}ms
          <span className="ml-1 text-xs text-muted-foreground">
            ({row.min_ms}~{row.max_ms})
          </span>
        </span>
      ),
    },
    {
      key: 'last_call',
      header: t('system.lastCall'),
      align: 'right',
      hiddenOnMobile: true,
      render: (row) => (
        <span className="text-sm">
          {row.last_call > 0 ? formatRelativeTime(row.last_call) : '-'}
        </span>
      ),
    },
  ]

  // -- Event log columns --

  const recentEvents = [...events].reverse().slice(0, 50)

  const eventColumns: Column<CortexModelEvent>[] = [
    {
      key: 'timestamp',
      header: t('system.eventTime'),
      render: (row) => <span className="font-mono text-sm">{formatEventTime(row.timestamp)}</span>,
    },
    {
      key: 'event',
      header: t('system.eventType'),
      render: (row) => (
        <StatusBadge
          status={row.event}
          colorMap={EVENT_COLORS}
          label={t(`system.eventTypes.${row.event}`)}
        />
      ),
    },
    {
      key: 'model',
      header: t('system.eventModel'),
      render: (row) => <span className="font-mono text-sm">{row.model}</span>,
    },
    {
      key: 'vram_before',
      header: t('system.eventVramBefore'),
      align: 'right',
      hiddenOnMobile: true,
      render: (row) => <span className="text-sm">{formatMB(row.vram_before_mb)}</span>,
    },
    {
      key: 'vram_after',
      header: t('system.eventVramAfter'),
      align: 'right',
      hiddenOnMobile: true,
      render: (row) => <span className="text-sm">{formatMB(row.vram_after_mb)}</span>,
    },
    {
      key: 'detail',
      header: t('system.eventDetail'),
      render: (row) => (
        <span className="text-sm text-muted-foreground">{row.detail || '-'}</span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('system.title')}</h1>
        <div className="flex items-center gap-2">
          {online && summary && summary.loaded > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">
                  {t('system.unloadAll')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('system.confirmUnloadAllTitle')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('system.confirmUnloadAllDesc')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('system.cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleUnloadAll}
                  >
                    {t('system.confirm')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button variant="outline" size="sm" disabled={isFetching} onClick={handleRefresh}>
            {isFetching ? t('common.loading') : t('system.refresh')}
          </Button>
        </div>
      </div>

      {/* Connection status */}
      <div className="flex items-center gap-2 text-sm">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${online ? 'bg-success' : 'bg-destructive'}`}
        />
        <span className={online ? 'text-success' : 'text-destructive'}>
          {online ? t('system.online') : t('system.offline')}
        </span>
        {online && uptime > 0 && (
          <span className="text-muted-foreground">
            &middot; {t('system.uptime')}: {formatUptime(uptime)}
          </span>
        )}
      </div>

      {/* Alert bar */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map(alert => (
            <div
              key={alert.key}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm ${ALERT_STYLES[alert.level]}`}
            >
              {alert.icon}
              <span className="flex-1">{alert.message}</span>
              <button
                onClick={() => setDismissedAlerts(prev => new Set([...prev, alert.key]))}
                className="opacity-60 hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Shared memory warning */}
      {online && sharedMemoryWarning && (
        <div className="rounded-xl border border-warning/30 bg-warning-light px-4 py-3 text-sm text-warning">
          {t('system.sharedMemoryWarning')}
        </div>
      )}

      {!online && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {t('system.cortexUnavailable')}
          </CardContent>
        </Card>
      )}

      {online && gpu && summary && (
        <>
          {/* GPU overview: 3-column grid */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Card 1: GPU Vitals with ring gauges */}
            <Card>
              <CardContent className="pt-4">
                <div className="mb-3 text-sm text-muted-foreground">{t('system.gpu')}</div>
                <div className="flex items-start gap-4">
                  {/* Ring gauges */}
                  <div className="flex gap-3">
                    {gpu.gpu_utilization_pct != null && (
                      <RingGauge
                        value={gpu.gpu_utilization_pct}
                        max={100}
                        label="GPU"
                        unit="%"
                        warningThreshold={70}
                        criticalThreshold={90}
                      />
                    )}
                    {gpu.vram_total_mb > 0 && (
                      <RingGauge
                        value={Math.round(gpu.vram_used_mb / gpu.vram_total_mb * 100)}
                        max={100}
                        label="VRAM"
                        unit="%"
                        warningThreshold={70}
                        criticalThreshold={90}
                      />
                    )}
                    {gpu.temperature_c != null && (
                      <RingGauge
                        value={gpu.temperature_c}
                        max={100}
                        label="Temp"
                        unit="C"
                        warningThreshold={65}
                        criticalThreshold={80}
                      />
                    )}
                  </div>
                  {/* Power */}
                  {gpu.power_watts != null && (
                    <span className="mt-4 text-sm text-muted-foreground">{gpu.power_watts}W</span>
                  )}
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  {gpu.name}
                  {gpu.driver_version != null && <span> &middot; {t('system.driverVersion')} {gpu.driver_version}</span>}
                  {gpu.cuda_version != null && <span> &middot; {t('system.cudaVersion')} {gpu.cuda_version}</span>}
                </div>
              </CardContent>
            </Card>

            {/* Card 2: VRAM stacked bar (merged with budget) */}
            <Card>
              <CardContent className="pt-4">
                <div className="mb-3 text-sm text-muted-foreground">{t('system.gpuVram')}</div>
                <VramStackedBar gpu={gpu} summary={summary} />
              </CardContent>
            </Card>

            {/* Card 3: Queue */}
            <Card>
              <CardContent className="pt-4">
                <div className="mb-3 text-sm text-muted-foreground">{t('system.queue')}</div>
                {queue ? (
                  <QueueIndicator queue={queue} />
                ) : (
                  <div className="text-sm text-muted-foreground">--</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* VRAM Timeline (wheel zoom + drag pan) */}
          <Card>
            <CardHeader>
              <CardTitle>{t('system.vramTimeline')}</CardTitle>
            </CardHeader>
            <CardContent>
              <VramTimelineChart
                samples={timeline?.samples ?? []}
                vramTotal={gpu.vram_total_mb}
              />
            </CardContent>
          </Card>

          {/* Inference statistics */}
          <Card>
            <CardHeader>
              <CardTitle>{t('system.inferenceStats')}</CardTitle>
            </CardHeader>
            <CardContent>
              {inferenceEntries.length > 0 ? (
                <DataTable
                  columns={inferenceColumns}
                  data={inferenceEntries}
                  rowKey={(row) => row.endpoint}
                />
              ) : (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  {t('system.noInferenceData')}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Models table */}
          <Card>
            <CardHeader className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>{t('system.modelRegistry')}</CardTitle>
              <Button
                variant="outline"
                size="sm"
                disabled={checkingAll}
                onClick={handleCheckAll}
              >
                {checkingAll ? t('common.loading') : t('system.checkAll')}
              </Button>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={modelColumns}
                data={modelList}
                rowKey={(row) => row.name}
              />
            </CardContent>
          </Card>

          {/* Model events log (default expanded) */}
          <Card>
            <CardHeader>
              <CardTitle>
                {t('system.modelEvents')}
                {events.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({events.length})
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentEvents.length > 0 ? (
                <DataTable
                  columns={eventColumns}
                  data={recentEvents}
                  rowKey={(row) => `${row.timestamp}-${row.model}-${row.event}`}
                />
              ) : (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  {t('system.noEvents')}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
