import { useState } from 'react'
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
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  if (d.toDateString() === now.toDateString()) return time
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${time}`
}

// -- VRAM Timeline mini chart (pure SVG, no library) --

function VramTimelineChart({ samples, vramTotal }: { samples: CortexVramSample[]; vramTotal: number }) {
  const { t } = useTranslation('admin')

  if (samples.length < 2) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        {t('system.noTimelineData')}
      </div>
    )
  }

  const W = 600
  const H = 120
  const PX = 40 // left padding for labels
  const PR = 8  // right padding
  const PY = 4  // top/bottom padding

  const chartW = W - PX - PR
  const chartH = H - PY * 2

  const tMin = samples[0].t
  const tMax = samples[samples.length - 1].t
  const tRange = tMax - tMin || 1

  const toX = (t: number) => PX + ((t - tMin) / tRange) * chartW
  const toY = (mb: number) => PY + chartH - (mb / vramTotal) * chartH

  // Build polyline points for VRAM usage
  const vramPoints = samples.map((s) => `${toX(s.t)},${toY(s.vram_used_mb)}`).join(' ')

  // Y-axis labels
  const yLabels = [0, Math.round(vramTotal / 2), vramTotal]

  // Event markers (non-empty events)
  const eventSamples = samples.filter((s) => s.event)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
      {/* Y grid lines and labels */}
      {yLabels.map((mb) => (
        <g key={mb}>
          <line
            x1={PX} y1={toY(mb)} x2={W - PR} y2={toY(mb)}
            stroke="currentColor" strokeOpacity={0.1} strokeDasharray="2,2"
          />
          <text
            x={PX - 4} y={toY(mb) + 3}
            textAnchor="end" fill="currentColor" fillOpacity={0.4}
            fontSize={9} fontFamily="monospace"
          >
            {mb >= 1024 ? `${(mb / 1024).toFixed(0)}G` : `${mb}M`}
          </text>
        </g>
      ))}

      {/* VRAM area fill */}
      <polygon
        points={`${toX(tMin)},${toY(0)} ${vramPoints} ${toX(tMax)},${toY(0)}`}
        fill="currentColor" fillOpacity={0.08}
      />

      {/* VRAM line */}
      <polyline
        points={vramPoints}
        fill="none" stroke="currentColor" strokeOpacity={0.5} strokeWidth={1.5}
      />

      {/* Event markers */}
      {eventSamples.map((s, i) => (
        <circle
          key={i}
          cx={toX(s.t)} cy={toY(s.vram_used_mb)}
          r={2.5} fill="hsl(var(--warning))"
        >
          <title>{s.event}</title>
        </circle>
      ))}
    </svg>
  )
}

export function AdminSystemPage() {
  const { t } = useTranslation('admin')
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
    queryFn: () => fetchCortexTimeline(300),
    refetchInterval: 30_000,
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
        <div className="rounded-md border border-warning/30 bg-warning-light px-4 py-3 text-sm text-warning">
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
