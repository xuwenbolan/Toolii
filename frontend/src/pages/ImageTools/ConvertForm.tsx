import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Accept } from 'react-dropzone'
import JSZip from 'jszip'
import { AlertCircle, CheckCircle2, Clock3, Loader2, RefreshCw, Trash2 } from 'lucide-react'

import { DownloadButton } from '@/components/tools/DownloadButton'
import { ToolActionBar } from '@/components/tools/ToolActionBar'
import { ToolErrorBanner } from '@/components/tools/ToolErrorBanner'
import { ToolResultPanel } from '@/components/tools/ToolResultPanel'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { ToolWorkspaceDropzone } from '@/components/tools/ToolWorkspaceDropzone'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToolRunState } from '@/hooks/useToolRunState'
import { formatBytes } from '@/lib/fileValidation'
import { isIntInRange, parseFiniteNumber } from '@/lib/numberInput'
import { cn } from '@/lib/utils'
import { convertImage, type FileResult } from '@/services/imageApi'

type Format = 'jpeg' | 'png' | 'webp'

type BatchStatus = 'waiting' | 'processing' | 'done' | 'error'

type BatchItem = {
  id: string
  file: File
  status: BatchStatus
  progress: number
  result: FileResult | null
  error: string | null
}

type ConvertFormProps = {
  title: string
  description: string
  fixedFormat?: Format
  acceptMime?: string
}

const CONCURRENCY = 3

function createItemId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function parseAcceptToMap(acceptMime?: string): Accept | undefined {
  if (!acceptMime) return { 'image/*': [] }
  const parts = acceptMime
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  if (parts.length === 0) return undefined

  const map: Accept = {}
  for (const part of parts) {
    map[part] = []
  }
  return map
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function getProgressForStatus(item: BatchItem) {
  if (item.status === 'waiting') return 0
  if (item.status === 'processing') return item.progress
  return 100
}

export function ConvertForm({ title, description, fixedFormat, acceptMime }: ConvertFormProps) {
  const { t } = useTranslation(['tools', 'common'])
  const [format, setFormat] = useState<Format>(fixedFormat ?? 'jpeg')
  const [qualityInput, setQualityInput] = useState('92')
  const [items, setItems] = useState<BatchItem[]>([])
  const [resultPanelOpen, setResultPanelOpen] = useState(false)
  const [zipPending, setZipPending] = useState(false)
  const [zipError, setZipError] = useState<string | null>(null)
  const inFlightRef = useRef(new Set<string>())
  const itemsRef = useRef<BatchItem[]>([])
  const previousPendingRef = useRef(false)

  const activeFormat = fixedFormat ?? format
  const quality = parseFiniteNumber(qualityInput)
  const qualityValid = activeFormat === 'png' || (quality != null && isIntInRange(quality, 1, 100))
  const acceptMap = useMemo(() => parseAcceptToMap(acceptMime), [acceptMime])

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  const totalCount = items.length
  const processingCount = items.filter((item) => item.status === 'processing').length
  const waitingCount = items.filter((item) => item.status === 'waiting').length
  const failedItems = items.filter((item) => item.status === 'error')
  const doneItems = items.filter((item) => item.status === 'done' && item.result)
  const failedCount = failedItems.length
  const doneCount = doneItems.length
  const pending = waitingCount > 0 || processingCount > 0
  const overallProgress =
    totalCount > 0
      ? Math.round(
          items.reduce((sum, item) => sum + getProgressForStatus(item), 0) / totalCount,
        )
      : null

  const hardError =
    !pending && totalCount > 0 && doneCount === 0 && failedCount > 0
      ? t('convert.batch.summaryAllFailed')
      : null

  const runState = useToolRunState({
    mode: 'auto',
    hasInput: totalCount > 0,
    hasResult: doneCount > 0,
    pending,
    error: hardError,
    texts: {
      empty: t('common:upload.dropHere'),
      input: t('convert.batch.summaryQueued', { count: totalCount }),
      processing: t('convert.batch.summaryProcessing', { done: doneCount, total: totalCount }),
      result:
        failedCount > 0
          ? t('convert.batch.summaryPartialFailed', { failed: failedCount, total: totalCount })
          : t('convert.batch.summaryDone', { done: doneCount, total: totalCount }),
    },
  })

  useEffect(() => {
    if (previousPendingRef.current && !pending && doneCount > 0) {
      setResultPanelOpen(true)
    }
    previousPendingRef.current = pending
  }, [pending, doneCount])

  const enqueueFiles = useCallback((files: File[]) => {
    if (files.length === 0) return
    setZipError(null)
    setItems((prev) => [
      ...prev,
      ...files.map((file) => ({
        id: createItemId(),
        file,
        status: 'waiting' as BatchStatus,
        progress: 0,
        result: null,
        error: null,
      })),
    ])
  }, [])

  const processItem = useCallback(
    async (id: string) => {
      const current = itemsRef.current.find((item) => item.id === id)
      if (!current) return

      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, status: 'processing', progress: 0, error: null }
            : item,
        ),
      )

      try {
        const result = await convertImage(
          current.file,
          {
            outputFormat: activeFormat,
            quality: activeFormat === 'png' ? undefined : (quality ?? undefined),
          },
          (percent) => {
            setItems((prev) =>
              prev.map((item) =>
                item.id === id
                  ? {
                      ...item,
                      progress: Math.max(0, Math.min(100, Math.round(percent))),
                    }
                  : item,
              ),
            )
          },
        )

        setItems((prev) =>
          prev.map((item) =>
            item.id === id
              ? { ...item, status: 'done', progress: 100, result, error: null }
              : item,
          ),
        )
      } catch {
        setItems((prev) =>
          prev.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: 'error',
                  progress: 100,
                  result: null,
                  error: t('convert.batch.itemFailed'),
                }
              : item,
          ),
        )
      }
    },
    [activeFormat, quality, t],
  )

  useEffect(() => {
    if (!qualityValid) return
    const availableSlots = CONCURRENCY - processingCount
    if (availableSlots <= 0) return

    const toStart = items
      .filter((item) => item.status === 'waiting' && !inFlightRef.current.has(item.id))
      .slice(0, availableSlots)

    for (const item of toStart) {
      inFlightRef.current.add(item.id)
      void processItem(item.id).finally(() => {
        inFlightRef.current.delete(item.id)
      })
    }
  }, [items, processItem, processingCount, qualityValid])

  const retryItem = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              status: 'waiting',
              progress: 0,
              result: null,
              error: null,
            }
          : item,
      ),
    )
  }, [])

  const retryFailed = useCallback(() => {
    setZipError(null)
    setItems((prev) =>
      prev.map((item) =>
        item.status === 'error'
          ? {
              ...item,
              status: 'waiting',
              progress: 0,
              result: null,
              error: null,
            }
          : item,
      ),
    )
  }, [])

  const clearFinished = useCallback(() => {
    setItems((prev) => prev.filter((item) => item.status !== 'done'))
    setResultPanelOpen(false)
  }, [])

  const downloadZip = useCallback(async () => {
    if (doneItems.length === 0) return
    setZipPending(true)
    setZipError(null)

    try {
      const zip = new JSZip()
      await Promise.all(
        doneItems.map(async (item) => {
          if (!item.result) return
          const response = await fetch(item.result.download_url, { credentials: 'include' })
          if (!response.ok) throw new Error('download-failed')
          const blob = await response.blob()
          zip.file(item.result.filename || item.file.name, blob)
        }),
      )

      const blob = await zip.generateAsync({ type: 'blob' })
      triggerBlobDownload(blob, `toolii-convert-${Date.now()}.zip`)
    } catch {
      setZipError(t('convert.batch.zipFailed'))
    } finally {
      setZipPending(false)
    }
  }, [doneItems, t])

  const bannerError = useMemo(() => {
    if (zipError) return zipError
    if (!pending && failedCount > 0) {
      return t('convert.batch.summaryPartialFailed', { failed: failedCount, total: totalCount })
    }
    return null
  }, [failedCount, pending, t, totalCount, zipError])

  return (
    <>
      <ToolPageShell
        title={title}
        description={description}
        backTo="/image-tools"
        layout="split"
        width="wide"
        sidebar={
          <div className="space-y-4">
            <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('convert.batch.queueTitle')}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {t('convert.batch.summaryProcessing', { done: doneCount, total: totalCount })}
              </p>
              <div className="mt-3 h-1.5 rounded-full bg-muted/80">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-[var(--duration-normal)] ease-[var(--ease-in-out)]"
                  style={{ width: `${overallProgress ?? 0}%` }}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{t('convert.batch.doneCount', { count: doneCount })}</span>
                <span>{t('convert.batch.failedCount', { count: failedCount })}</span>
                <span>{t('convert.batch.waitingCount', { count: waitingCount })}</span>
              </div>
            </div>

            {failedCount > 0 ? (
              <Button type="button" variant="outline" onClick={retryFailed}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {t('convert.batch.retryFailed')}
              </Button>
            ) : null}

            {doneCount > 0 ? (
              <Button type="button" variant="outline" onClick={clearFinished}>
                <Trash2 className="mr-2 h-4 w-4" />
                {t('convert.batch.clearFinished')}
              </Button>
            ) : null}
          </div>
        }
      >
        <div className="space-y-5">
          <ToolWorkspaceDropzone
            accept={acceptMap}
            multiple
            onFiles={enqueueFiles}
            title={t('convert.batch.dropTitle')}
            hint={t('convert.batch.dropHint')}
          />

          <ToolErrorBanner
            error={bannerError}
            errorMeta={null}
            onRetry={failedCount > 0 ? retryFailed : undefined}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            {!fixedFormat ? (
              <div className="space-y-2">
                <Label htmlFor="format">{t('convert.outputFormat')}</Label>
                <select
                  id="format"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={pending}
                  value={format}
                  onChange={(event) => {
                    setFormat(event.target.value as Format)
                  }}
                >
                  <option value="jpeg">JPG</option>
                  <option value="png">PNG</option>
                  <option value="webp">WEBP</option>
                </select>
              </div>
            ) : null}

            {activeFormat !== 'png' ? (
              <div className="space-y-2">
                <Label htmlFor="quality">{t('convert.qualityLabel')}</Label>
                <Input
                  id="quality"
                  type="number"
                  min={1}
                  max={100}
                  value={qualityInput}
                  onChange={(event) => setQualityInput(event.target.value)}
                />
              </div>
            ) : null}
          </div>

          {items.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((item) => {
                const stateIcon =
                  item.status === 'processing' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : item.status === 'done' ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : item.status === 'error' ? (
                    <AlertCircle className="h-4 w-4" />
                  ) : (
                    <Clock3 className="h-4 w-4" />
                  )

                const stateLabel =
                  item.status === 'processing'
                    ? t('convert.batch.stateProcessing')
                    : item.status === 'done'
                      ? t('convert.batch.stateDone')
                      : item.status === 'error'
                        ? t('convert.batch.stateFailed')
                        : t('convert.batch.stateQueued')

                return (
                  <article
                    key={item.id}
                    className={cn(
                      'rounded-xl border p-3 shadow-sm transition-colors',
                      item.status === 'done' && 'border-success/35 bg-success-light/35',
                      item.status === 'error' && 'border-destructive/35 bg-destructive-light/45',
                      item.status === 'processing' && 'border-primary/35 bg-primary/[0.03]',
                      item.status === 'waiting' && 'border-border/70 bg-card',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.file.name}</p>
                        <p className="text-xs text-muted-foreground">{formatBytes(item.file.size)}</p>
                      </div>
                      <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        {stateIcon}
                        {stateLabel}
                      </p>
                    </div>

                    <div className="mt-2 h-1.5 rounded-full bg-muted/70">
                      <div
                        className="h-full rounded-full bg-primary transition-[width] duration-[var(--duration-normal)] ease-[var(--ease-in-out)]"
                        style={{ width: `${getProgressForStatus(item)}%` }}
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      {item.status === 'error' ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => retryItem(item.id)}
                        >
                          {t('common:errors.retry')}
                        </Button>
                      ) : null}

                      {item.status === 'done' && item.result ? (
                        <DownloadButton
                          url={item.result.download_url}
                          size="sm"
                          className="w-auto px-3"
                        />
                      ) : null}
                    </div>
                  </article>
                )
              })}
            </div>
          ) : null}
        </div>
      </ToolPageShell>

      <ToolActionBar
        mode="auto"
        status={runState.statusText}
        pending={pending || zipPending}
        progress={zipPending ? undefined : overallProgress}
        error={hardError}
        done={runState.phase === 'done'}
      />

      <ToolResultPanel
        open={resultPanelOpen && doneCount > 0}
        title={t('common:actions.downloadResult')}
        onClose={() => setResultPanelOpen(false)}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {failedCount > 0
              ? t('convert.batch.summaryPartialFailed', { failed: failedCount, total: totalCount })
              : t('convert.batch.summaryDone', { done: doneCount, total: totalCount })}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setResultPanelOpen(false)}>
              {t('common:actions.back')}
            </Button>
            <Button type="button" onClick={() => void downloadZip()} disabled={zipPending || doneCount === 0}>
              {zipPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('common:actions.processing')}
                </>
              ) : (
                t('common:actions.downloadZip')
              )}
            </Button>
          </div>
        </div>
      </ToolResultPanel>
    </>
  )
}
