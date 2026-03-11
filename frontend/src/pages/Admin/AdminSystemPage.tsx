import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { AdminErrorState } from '@/components/admin'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  fetchCortexStatus,
  unloadAllCortexModels,
  fetchCortexTimeline,
} from '@/services/adminApi'
import { formatUptime, computeAlerts } from './cortex-helpers'
import { CortexStatusCard } from './CortexStatusCard'
import { CortexModelsList } from './CortexModelsList'
import { CortexTimeline } from './CortexTimeline'

export function AdminSystemPage() {
  const { t } = useTranslation('console')
  const queryClient = useQueryClient()
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
    queryClient.invalidateQueries({ queryKey: ['admin', 'cortex-status'] })
    queryClient.invalidateQueries({ queryKey: ['admin', 'cortex-timeline'] })
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

  const handleDismissAlert = (key: string) => {
    setDismissedAlerts(prev => new Set([...prev, key]))
  }

  if (isError) return <AdminErrorState onRetry={() => refetch()} />

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        {t('common.loading')}
      </div>
    )
  }

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

      {!online && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {t('system.cortexUnavailable')}
          </CardContent>
        </Card>
      )}

      {online && gpu && summary && (
        <>
          <CortexStatusCard
            gpu={gpu}
            summary={summary}
            queue={queue}
            timelineSamples={timeline?.samples ?? []}
            alerts={alerts}
            sharedMemoryWarning={sharedMemoryWarning}
            onDismissAlert={handleDismissAlert}
          />

          <CortexModelsList
            modelList={modelList}
            inferenceStats={inferenceStats}
            online={online}
            onRefresh={handleRefresh}
          />

          <CortexTimeline events={events} />
        </>
      )}
    </div>
  )
}
