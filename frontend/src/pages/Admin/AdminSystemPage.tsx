import { useState, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { AdminErrorState, DataTable, StatusBadge } from '@/components/admin'
import type { Column } from '@/components/admin'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  fetchCortexStatus,
  checkCortexModels,
  checkCortexModel,
  unloadAllCortexModels,
  fetchCortexTimeline,
} from '@/services/adminApi'
import type {
  CortexModelItem,
  CortexModelCheckResult,
  CortexModelEvent,
  CortexVramSample,
} from '@/services/adminApi'

const MODEL_STATUS_COLORS: Record<string, string> = {
  loaded: 'bg-success-light text-success border-success/20',
  available: 'bg-info-light text-info border-info/20',
  missing: 'bg-destructive-light text-destructive border-destructive/20',
}

const EVENT_COLORS: Record<string, string> = {
  loaded: 'bg-success-light text-success border-success/20',
  evicted_lru: 'bg-warning-light text-warning border-warning/20',
  evicted_idle: 'bg-warning-light text-warning border-warning/20',
  evicted_budget: 'bg-warning-light text-warning border-warning/20',
  oom_retry: 'bg-destructive-light text-destructive border-destructive/20',
}

// Display MB values, switching to GB when >= 1024 MB
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

// -- VRAM Timeline interactive chart (wheel zoom + drag pan) --

const TL_W = 600
const TL_H = 224
const TL_PX = 44   // left padding (Y-axis labels)
const TL_PR = 12   // right padding
const TL_PT = 14   // top padding
const TL_PB = 28   // bottom padding (X-axis labels)
const TL_CW = TL_W - TL_PX - TL_PR
const TL_CH = TL_H - TL_PT - TL_PB
const TL_MIN_SPAN = 30
const TL_ZOOM_FACTOR = 1.4
const TL_TICK_STEPS = [5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600, 7200, 14400, 28800, 43200, 86400]

function VramTimelineChart({ samples, vramTotal }: { samples: CortexVramSample[]; vramTotal: number }) {
  const { t } = useTranslation('console')
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  // null = default view (follow latest, last 5 min). Non-null = user-controlled.
  const [view, setView] = useState<{ start: number; end: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Data bounds
  const dataStart = samples.length > 1 ? samples[0].t : 0
  const dataEnd = samples.length > 1 ? samples[samples.length - 1].t : 1
  const dataRange = dataEnd - dataStart || 1

  // Resolve view window
  const defaultSpan = Math.min(300, dataRange)
  const vEnd = view ? view.end : dataEnd
  const vStart = view ? view.start : Math.max(dataStart, dataEnd - defaultSpan)
  const vSpan = vEnd - vStart || 1

  // Refs for non-passive event handlers (avoid stale closures)
  const viewRef = useRef({ start: vStart, end: vEnd, span: vSpan })
  const boundsRef = useRef({ start: dataStart, end: dataEnd, range: dataRange })
  useEffect(() => {
    viewRef.current = { start: vStart, end: vEnd, span: vSpan }
    boundsRef.current = { start: dataStart, end: dataEnd, range: dataRange }
  })

  // Filter visible samples (with small margin for line continuity)
  const visible = useMemo(() => {
    if (samples.length < 2) return []
    const m = vSpan * 0.02
    return samples.filter(s => s.t >= vStart - m && s.t <= vEnd + m)
  }, [samples, vStart, vEnd, vSpan])

  // Non-passive wheel zoom
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

  // Y-axis: adaptive range from visible data
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

  // Coordinate mapping
  const toX = (tv: number) => TL_PX + ((tv - vStart) / vSpan) * TL_CW
  const toY = (mb: number) => TL_PT + TL_CH - ((mb - yMin) / yRange) * TL_CH

  // Polyline + events
  const vramPoints = visible.map(s => `${toX(s.t)},${toY(s.vram_used_mb)}`).join(' ')
  const eventSamples = visible.filter(s => s.event)
  const yMid = Math.round((yMin + yMax) / 2)
  const yLabels = [yMin, yMid, yMax]

  // X-axis ticks
  const tickStep = TL_TICK_STEPS.find(s => s >= vSpan / 5) ?? 86400
  const xTicks: number[] = []
  for (let tv = Math.ceil(vStart / tickStep) * tickStep; tv <= vEnd; tv += tickStep) xTicks.push(tv)

  // Formatters
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

  // -- Drag pan --
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

  // -- Hover tooltip --
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
        {/* Y grid + labels */}
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

        {/* X-axis ticks + labels */}
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

        {/* VRAM area fill */}
        {visible.length >= 2 && (
          <polygon
            points={`${toX(visible[0].t)},${toY(yMin)} ${vramPoints} ${toX(visible[visible.length - 1].t)},${toY(yMin)}`}
            fill="var(--chart-palette-1)" fillOpacity={0.12}
          />
        )}

        {/* VRAM line */}
        {visible.length >= 2 && (
          <polyline points={vramPoints} fill="none" stroke="var(--chart-palette-1)" strokeWidth={1.5} />
        )}

        {/* Event markers */}
        {eventSamples.map((s, i) => (
          <circle key={i} cx={toX(s.t)} cy={toY(s.vram_used_mb)} r={3} fill="var(--chart-palette-3)">
            <title>{s.event}</title>
          </circle>
        ))}

        {/* Hover crosshair */}
        {hovered && (
          <>
            <line x1={toX(hovered.t)} y1={TL_PT} x2={toX(hovered.t)} y2={TL_PT + TL_CH}
              stroke="currentColor" strokeOpacity={0.3} strokeWidth={1} strokeDasharray="3,2" />
            <circle cx={toX(hovered.t)} cy={toY(hovered.vram_used_mb)}
              r={3.5} fill="var(--chart-palette-1)" stroke="var(--background)" strokeWidth={1.5} />
          </>
        )}

        {/* Span indicator (top-right) */}
        <text x={TL_W - TL_PR} y={TL_PT + 10} textAnchor="end"
          fill="currentColor" fillOpacity={0.35} fontSize={10} fontFamily="var(--font-mono)">
          {fmtSpan(vSpan)}
        </text>
      </svg>

      {/* Tooltip */}
      {hovered && (
        <div
          className="pointer-events-none absolute top-1 rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${(toX(hovered.t) / TL_W) * 100}%`,
            transform: toX(hovered.t) > TL_W * 0.7 ? 'translateX(-100%)' : 'translateX(0)',
          }}
        >
          <div className="font-mono text-muted-foreground">{fmtTooltipTime(hovered.t)}</div>
          <div>VRAM: <span className="font-semibold">{fmtMb(hovered.vram_used_mb)}</span> / {fmtMb(vramTotal)}</div>
          <div>RAM: {fmtMb(hovered.sys_ram_mb)}</div>
          <div>Models: {hovered.models}</div>
          {hovered.event && <div className="text-warning">{hovered.event}</div>}
        </div>
      )}
    </div>
  )
}

export function AdminSystemPage() {
  const { t } = useTranslation('console')
  const queryClient = useQueryClient()
  const [checkResults, setCheckResults] = useState<Record<string, CortexModelCheckResult>>({})
  const [checkingModel, setCheckingModel] = useState<string | null>(null)
  const [checkingAll, setCheckingAll] = useState(false)
  const [unloading, setUnloading] = useState(false)
  const [eventsExpanded, setEventsExpanded] = useState(false)
  const [timelineExpanded, setTimelineExpanded] = useState(false)

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'cortex-status'],
    queryFn: fetchCortexStatus,
    refetchInterval: 30_000,
  })

  const { data: timeline } = useQuery({
    queryKey: ['admin', 'cortex-timeline'],
    queryFn: () => fetchCortexTimeline(0),
    refetchInterval: 60_000,
    enabled: data?.online === true && timelineExpanded,
  })

  const online = data?.online ?? false
  const health = data?.health
  const models = data?.models
  const gpu = models?.gpu
  const summary = models?.summary
  const modelList = models?.models ?? []
  const events = models?.events ?? []
  const inferenceStats = models?.inference_stats ?? {}
  const queue = health?.queue
  const sharedMemoryWarning = health?.shared_memory_warning ?? false
  const uptime = models?.uptime_seconds ?? 0

  const handleRefresh = () => {
    setCheckResults({})
    queryClient.invalidateQueries({ queryKey: ['admin', 'cortex-status'] })
    if (timelineExpanded) {
      queryClient.invalidateQueries({ queryKey: ['admin', 'cortex-timeline'] })
    }
  }

  const handleCheckAll = async () => {
    setCheckingAll(true)
    try {
      const result = await checkCortexModels()
      if (result.models) {
        const map: Record<string, CortexModelCheckResult> = {}
        for (const m of result.models) {
          map[m.name] = m
        }
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
      setCheckResults((prev) => ({ ...prev, [name]: result }))
    } catch {
      toast.error(t('common.error'))
    } finally {
      setCheckingModel(null)
    }
  }

  const handleUnloadAll = async () => {
    setUnloading(true)
    try {
      await unloadAllCortexModels()
      toast.success(t('system.unloadAllSuccess'))
      handleRefresh()
    } catch {
      toast.error(t('common.error'))
    } finally {
      setUnloading(false)
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

  const vramPercent =
    gpu && gpu.vram_total_mb > 0
      ? Math.round((gpu.vram_used_mb / gpu.vram_total_mb) * 100)
      : 0

  const budgetPercent =
    summary && summary.vram_budget_mb > 0
      ? Math.round(summary.vram_utilization * 100)
      : 0

  // -- Model table columns --

  const modelColumns: Column<CortexModelItem>[] = [
    {
      key: 'name',
      header: t('system.model'),
      render: (row) => <span className="font-mono text-sm">{row.name}</span>,
    },
    {
      key: 'status',
      header: t('system.status'),
      render: (row) => {
        const check = checkResults[row.name]
        return (
          <div className="flex items-center gap-2">
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
        <span className="text-sm">{row.required ? t('system.yes') : t('system.no')}</span>
      ),
    },
    {
      key: 'vram_mb',
      header: 'VRAM',
      align: 'right',
      render: (row) => <span className="text-sm">{formatMB(row.vram_mb)}</span>,
    },
    {
      key: 'vram_delta',
      header: t('system.vramDelta'),
      align: 'right',
      hiddenOnMobile: true,
      render: (row) => (
        <span className="text-sm">
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
        <span className="text-sm">
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
        <span className="text-sm">
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
        <span className="text-sm">
          {row.file_size_mb != null ? formatMB(row.file_size_mb) : '-'}
        </span>
      ),
    },
    {
      key: 'load_time',
      header: t('system.loadTime'),
      align: 'right',
      hiddenOnMobile: true,
      render: (row) => (
        <span className="text-sm">
          {row.load_time_ms != null ? `${row.load_time_ms}ms` : '-'}
        </span>
      ),
    },
    {
      key: 'loaded_at',
      header: t('system.loadedAt'),
      align: 'right',
      hiddenOnMobile: true,
      render: (row) => (
        <span className="text-sm">
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
        <span className="text-sm">
          {row.idle_seconds != null ? formatIdleTime(row.idle_seconds) : '-'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <Button
          variant="outline"
          size="sm"
          disabled={checkingModel === row.name || !online}
          onClick={() => handleCheckModel(row.name)}
        >
          {checkingModel === row.name ? '...' : t('system.check')}
        </Button>
      ),
    },
  ]

  // -- Inference stats as array --

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
      render: (row) => (
        <span className={`text-sm ${row.errors > 0 ? 'text-destructive' : ''}`}>
          {row.errors}
        </span>
      ),
    },
    {
      key: 'avg_ms',
      header: t('system.avgLatency'),
      align: 'right',
      render: (row) => <span className="text-sm">{row.avg_ms}ms</span>,
    },
    {
      key: 'min_ms',
      header: t('system.minLatency'),
      align: 'right',
      hiddenOnMobile: true,
      render: (row) => <span className="text-sm">{row.min_ms}ms</span>,
    },
    {
      key: 'max_ms',
      header: t('system.maxLatency'),
      align: 'right',
      hiddenOnMobile: true,
      render: (row) => <span className="text-sm">{row.max_ms}ms</span>,
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
            <Button
              variant="outline"
              size="sm"
              disabled={unloading}
              onClick={handleUnloadAll}
            >
              {unloading ? t('common.loading') : t('system.unloadAll')}
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={isFetching} onClick={handleRefresh}>
            {isFetching ? t('common.loading') : t('system.refresh')}
          </Button>
        </div>
      </div>

      {/* Shared memory warning */}
      {online && sharedMemoryWarning && (
        <div className="rounded-xl border border-warning/30 bg-warning-light px-4 py-3 text-sm text-warning">
          {t('system.sharedMemoryWarning')}
        </div>
      )}

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

      {!online && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {t('system.cortexUnavailable')}
          </CardContent>
        </Card>
      )}

      {online && gpu && summary && (
        <>
          {/* GPU overview cards */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Card 1: GPU info */}
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">{t('system.gpu')}</div>
                <div className="mt-1 text-lg font-semibold">{gpu.name}</div>
                <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {(gpu.driver_version != null || gpu.cuda_version != null) && (
                    <div>
                      {gpu.driver_version != null && (
                        <span>{t('system.driverVersion')} {gpu.driver_version}</span>
                      )}
                      {gpu.driver_version != null && gpu.cuda_version != null && (
                        <span className="mx-1.5">|</span>
                      )}
                      {gpu.cuda_version != null && (
                        <span>{t('system.cudaVersion')} {gpu.cuda_version}</span>
                      )}
                    </div>
                  )}
                  <div className="flex gap-4">
                    {gpu.gpu_utilization_pct != null && (
                      <span>{t('system.gpuUtilization')} {gpu.gpu_utilization_pct}%</span>
                    )}
                    {gpu.memory_utilization_pct != null && (
                      <span>{t('system.memoryUtilization')} {gpu.memory_utilization_pct}%</span>
                    )}
                  </div>
                  <div className="flex gap-4">
                    {gpu.temperature_c != null && (
                      <span>{t('system.temperature')} {gpu.temperature_c}C</span>
                    )}
                    {gpu.power_watts != null && (
                      <span>{t('system.power')} {gpu.power_watts}W</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Card 2: GPU VRAM */}
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">{t('system.gpuVram')}</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-lg font-semibold">{formatMB(gpu.vram_used_mb)}</span>
                  <span className="text-sm text-muted-foreground">
                    / {formatMB(gpu.vram_total_mb)}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-foreground/70 transition-all"
                    style={{ width: `${vramPercent}%` }}
                  />
                </div>
                <div className="mt-1 text-xs text-muted-foreground text-right">{vramPercent}%</div>
              </CardContent>
            </Card>

            {/* Card 3: Model budget */}
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">{t('system.modelBudget')}</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-lg font-semibold">{formatMB(summary.vram_real_mb)}</span>
                  <span className="text-sm text-muted-foreground">
                    / {formatMB(summary.vram_budget_mb)}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-foreground/70 transition-all"
                    style={{ width: `${budgetPercent}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                  <span>
                    {summary.loaded} / {summary.registered} {t('system.modelsLoaded')}
                  </span>
                  <span>{budgetPercent}%</span>
                </div>
              </CardContent>
            </Card>

            {/* Card 4: Queue */}
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">{t('system.queue')}</div>
                {queue ? (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg font-semibold">{queue.active}</span>
                      <span className="text-sm text-muted-foreground">
                        / {queue.max_concurrent}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {t('system.queueTimeout')}: {queue.timeout_seconds}s
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-muted-foreground">--</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* VRAM Timeline */}
          <Card>
            <CardHeader className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>{t('system.vramTimeline')}</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTimelineExpanded(!timelineExpanded)}
              >
                {timelineExpanded ? t('system.hideTimeline') : t('system.showTimeline')}
              </Button>
            </CardHeader>
            {timelineExpanded && (
              <CardContent>
                <VramTimelineChart
                  samples={timeline?.samples ?? []}
                  vramTotal={gpu.vram_total_mb}
                />
              </CardContent>
            )}
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

          {/* Model events log */}
          <Card>
            <CardHeader className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>
                {t('system.modelEvents')}
                {events.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({events.length})
                  </span>
                )}
              </CardTitle>
              {events.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEventsExpanded(!eventsExpanded)}
                >
                  {eventsExpanded ? t('system.hideEvents') : t('system.showEvents')}
                </Button>
              )}
            </CardHeader>
            {eventsExpanded && (
              <CardContent>
                <DataTable
                  columns={eventColumns}
                  data={recentEvents}
                  rowKey={(row) => `${row.timestamp}-${row.model}-${row.event}`}
                />
              </CardContent>
            )}
            {!eventsExpanded && events.length === 0 && (
              <CardContent>
                <div className="py-6 text-center text-sm text-muted-foreground">
                  {t('system.noEvents')}
                </div>
              </CardContent>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
