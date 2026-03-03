import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { DataTable, StatusBadge } from '@/components/admin'
import type { Column } from '@/components/admin'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  fetchCortexStatus,
  checkCortexModels,
  checkCortexModel,
} from '@/services/adminApi'
import type {
  CortexModelItem,
  CortexModelCheckResult,
} from '@/services/adminApi'

const MODEL_STATUS_COLORS: Record<string, string> = {
  loaded: 'bg-success-light text-success border-success/20',
  available: 'bg-info-light text-info border-info/20',
  missing: 'bg-destructive-light text-destructive border-destructive/20',
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

export function AdminSystemPage() {
  const { t } = useTranslation('admin')
  const queryClient = useQueryClient()
  const [checkResults, setCheckResults] = useState<Record<string, CortexModelCheckResult>>({})
  const [checkingModel, setCheckingModel] = useState<string | null>(null)
  const [checkingAll, setCheckingAll] = useState(false)

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['admin', 'cortex-status'],
    queryFn: fetchCortexStatus,
    refetchInterval: 30_000,
  })

  const online = data?.online ?? false
  const models = data?.models
  const gpu = models?.gpu
  const summary = models?.summary
  const modelList = models?.models ?? []
  const uptime = models?.uptime_seconds ?? 0

  const handleRefresh = () => {
    setCheckResults({})
    queryClient.invalidateQueries({ queryKey: ['admin', 'cortex-status'] })
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

  const columns: Column<CortexModelItem>[] = [
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
      render: (row) => (
        <span className="text-sm">{row.required ? t('system.yes') : t('system.no')}</span>
      ),
    },
    {
      key: 'vram_mb',
      header: 'VRAM',
      align: 'right',
      render: (row) => <span className="text-sm">{row.vram_mb} MB</span>,
    },
    {
      key: 'file_size',
      header: t('system.fileSize'),
      align: 'right',
      render: (row) => (
        <span className="text-sm">
          {row.file_size_mb != null ? `${row.file_size_mb} MB` : '-'}
        </span>
      ),
    },
    {
      key: 'idle',
      header: t('system.idle'),
      align: 'right',
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('system.title')}</h1>
        <div className="flex items-center gap-2">
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

      {!online && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {t('system.cortexUnavailable')}
          </CardContent>
        </Card>
      )}

      {online && gpu && summary && (
        <>
          {/* GPU + VRAM cards */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">{t('system.gpu')}</div>
                <div className="mt-1 text-lg font-semibold">{gpu.name}</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">{t('system.gpuVram')}</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-lg font-semibold">{gpu.vram_used_mb}</span>
                  <span className="text-sm text-muted-foreground">
                    / {gpu.vram_total_mb} MB
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

            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">{t('system.modelBudget')}</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-lg font-semibold">{summary.vram_used_mb}</span>
                  <span className="text-sm text-muted-foreground">
                    / {summary.vram_budget_mb} MB
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-foreground/70 transition-all"
                    style={{ width: `${budgetPercent}%` }}
                  />
                </div>
                <div className="mt-1 text-xs text-muted-foreground text-right">{budgetPercent}%</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">{t('system.modelsLoaded')}</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-lg font-semibold">{summary.loaded}</span>
                  <span className="text-sm text-muted-foreground">
                    / {summary.registered}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Models table */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
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
                columns={columns}
                data={modelList}
                rowKey={(row) => row.name}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
