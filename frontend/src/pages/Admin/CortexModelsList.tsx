import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTable, StatusBadge } from '@/components/admin'
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
  checkCortexModels,
  checkCortexModel,
  unloadCortexModel,
  enableCortexModel,
  disableCortexModel,
} from '@/services/adminApi'
import type {
  CortexModelItem,
  CortexModelCheckResult,
} from '@/services/adminApi'
import { formatMB, formatRelativeTime, formatIdleTime, MODEL_STATUS_COLORS } from './cortex-helpers'

// -- Inference stats types --

interface InferenceStatsMap {
  [endpoint: string]: {
    calls: number
    errors: number
    avg_ms: number
    min_ms: number
    max_ms: number
    last_call: number
  }
}

type InferenceRow = {
  endpoint: string
  calls: number
  errors: number
  avg_ms: number
  min_ms: number
  max_ms: number
  last_call: number
}

// -- Main component --

interface CortexModelsListProps {
  modelList: CortexModelItem[]
  inferenceStats: InferenceStatsMap
  online: boolean
  onRefresh: () => void
}

export function CortexModelsList({
  modelList,
  inferenceStats,
  online,
  onRefresh,
}: CortexModelsListProps) {
  const { t } = useTranslation('console')
  const [checkResults, setCheckResults] = useState<Record<string, CortexModelCheckResult>>({})
  const [checkingModel, setCheckingModel] = useState<string | null>(null)
  const [checkingAll, setCheckingAll] = useState(false)
  const [unloadingModel, setUnloadingModel] = useState<string | null>(null)
  const [togglingModel, setTogglingModel] = useState<string | null>(null)

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

  const handleUnloadModel = async (name: string) => {
    setUnloadingModel(name)
    try {
      await unloadCortexModel(name)
      toast.success(t('system.unloadSuccess'))
      onRefresh()
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
      onRefresh()
    } catch {
      toast.error(t('common.error'))
    } finally {
      setTogglingModel(null)
    }
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

  // -- Inference stats --

  const inferenceEntries: InferenceRow[] = Object.entries(inferenceStats).map(([ep, s]) => ({
    endpoint: ep,
    ...s,
  }))

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

  return (
    <>
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
    </>
  )
}
