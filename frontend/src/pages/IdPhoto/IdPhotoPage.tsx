import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BalanceDisplay } from '@/components/credits/BalanceDisplay'
import { InsufficientCreditsDialog } from '@/components/credits/InsufficientCreditsDialog'
import { BackgroundColorPicker } from '@/components/idPhoto/BackgroundColorPicker'
import { ComplianceResults } from '@/components/idPhoto/ComplianceResults'
import { ModelTierSelector } from '@/components/idPhoto/ModelTierSelector'
import { PaywallGate } from '@/components/idPhoto/PaywallGate'
import { PhotoPreview } from '@/components/idPhoto/PhotoPreview'
import { PrintLayoutPreview } from '@/components/idPhoto/PrintLayoutPreview'
import { SizeStandardPicker } from '@/components/idPhoto/SizeStandardPicker'
import { StepIndicator } from '@/components/idPhoto/StepIndicator'
import { DownloadButton } from '@/components/tools/DownloadButton'
import { ProcessingStatus } from '@/components/tools/ProcessingStatus'
import { SEOHead } from '@/components/common/SEOHead'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { UploadProgress } from '@/components/upload/UploadProgress'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PHOTO_STANDARDS_FALLBACK } from '@/config/photoStandards'
import { useAuth } from '@/hooks/useAuth'
import { useCredits } from '@/hooks/useCredits'
import { useFileUpload } from '@/hooks/useFileUpload'
import { formatBytes } from '@/lib/fileValidation'
import {
  exportIdPhoto,
  fetchPhotoStandards,
  layoutIdPhoto,
  processIdPhoto,
  type PhotoProcessResponse,
  type PhotoStandard,
  type PhotoUploadResponse,
  uploadIdPhoto,
} from '@/services/idPhotoApi'
import type { FileResult } from '@/services/imageApi'

// Map standard code to translation key for display name
const STANDARD_I18N_MAP: Record<string, string> = {
  'uk-passport': 'standards.ukPassport',
  'schengen-visa': 'standards.schengenVisa',
  'cn-passport': 'standards.cnPassport',
  'us-2x2': 'standards.us2x2',
}

function getApiErrorMessage(error: unknown, fallback: string): string {
  const maybe = error as { response?: { data?: { message?: string } } }
  return maybe?.response?.data?.message || fallback
}

function getApiErrorCode(error: unknown): string | undefined {
  const maybe = error as { response?: { data?: { code?: string } } }
  return maybe?.response?.data?.code
}

export function IdPhotoPage() {
  const { t } = useTranslation('idPhoto')
  const { isAuthenticated } = useAuth()
  const credits = useCredits({
    enabled: isAuthenticated,
    includeTransactions: isAuthenticated,
    transactionsLimit: 5,
  })
  const [standards, setStandards] = useState<PhotoStandard[]>(PHOTO_STANDARDS_FALLBACK)
  const [selectedStandardCode, setSelectedStandardCode] = useState(PHOTO_STANDARDS_FALLBACK[0]?.code ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [uploadResult, setUploadResult] = useState<PhotoUploadResponse | null>(null)
  const [processResult, setProcessResult] = useState<PhotoProcessResponse | null>(null)
  const [exportResult, setExportResult] = useState<FileResult | null>(null)
  const [layoutResult, setLayoutResult] = useState<FileResult | null>(null)
  const [layoutCopies, setLayoutCopies] = useState<number | ''>('')
  const [backgroundColor, setBackgroundColor] = useState('#FFFFFF')
  const [modelTier, setModelTier] = useState<'fast' | 'balanced' | 'hq'>('fast')
  const [loadingStandards, setLoadingStandards] = useState(false)
  const [processPending, setProcessPending] = useState(false)
  const [processError, setProcessError] = useState<string | null>(null)
  const [exportPending, setExportPending] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [layoutPending, setLayoutPending] = useState(false)
  const [layoutError, setLayoutError] = useState<string | null>(null)
  const [insufficientDialogOpen, setInsufficientDialogOpen] = useState(false)
  const [insufficientActionLabel, setInsufficientActionLabel] = useState(t('exportAction'))
  const uploadTask = useFileUpload()

  const STEPS = [
    t('steps.upload'),
    t('steps.detection'),
    t('steps.spec'),
    t('steps.preview'),
    t('steps.export'),
  ]

  useEffect(() => {
    let active = true
    setLoadingStandards(true)
    void fetchPhotoStandards()
      .then((items) => {
        if (!active || items.length === 0) return
        setStandards(items)
        setSelectedStandardCode((prev) => prev || items[0].code)
      })
      .catch(() => {
        // Keep fallback standards.
      })
      .finally(() => {
        if (active) setLoadingStandards(false)
      })
    return () => {
      active = false
    }
  }, [])

  const selectedStandard = useMemo(
    () => standards.find((item) => item.code === selectedStandardCode) ?? standards[0] ?? null,
    [standards, selectedStandardCode],
  )

  const currentStep = useMemo(() => {
    if (exportResult || layoutResult) return 4
    if (processResult) return 3
    if (uploadResult) return 1
    if (file) return 0
    return 0
  }, [file, uploadResult, processResult, exportResult, layoutResult])

  const fileInfo = useMemo(() => {
    if (!file) return null
    return `${file.name} · ${formatBytes(file.size)}`
  }, [file])

  const handleInsufficientCredits = (error: unknown, actionLabel: string) => {
    if (getApiErrorCode(error) !== 'INSUFFICIENT_CREDITS') return false
    setInsufficientActionLabel(actionLabel)
    setInsufficientDialogOpen(true)
    void credits.refreshAll()
    return true
  }

  return (
    <>
      <SEOHead title={t('seo.title')} description={t('seo.description')} keywords={t('seo.keywords')} canonicalPath="/id-photo" />
      <ToolPageShell
        title={t('title')}
        description={t('workflow')}
        backTo="/"
      >
      <div className="space-y-5">
        <StepIndicator steps={STEPS} currentStep={currentStep} />

        <div className="space-y-3 rounded-xl border p-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">{t('upload.title')}</h2>
            <p className="text-xs text-muted-foreground">
              {t('upload.hint')}
            </p>
          </div>

          <FileDropzone
            accept="image/*"
            onFiles={(files) => {
              uploadTask.reset()
              setProcessError(null)
              setExportError(null)
              setLayoutError(null)
              setUploadResult(null)
              setProcessResult(null)
              setExportResult(null)
              setLayoutResult(null)
              setFile(files[0])
            }}
          />

          {fileInfo ? <p className="text-xs text-muted-foreground">{fileInfo}</p> : null}
          <ProcessingStatus pending={uploadTask.pending} error={uploadTask.error} />
          <UploadProgress value={uploadTask.pending ? uploadTask.progress : null} />

          <Button
            type="button"
            className="w-full"
            disabled={!file || uploadTask.pending}
            onClick={async () => {
              if (!file) return
              setUploadResult(null)
              setProcessResult(null)
              setExportResult(null)
              setLayoutResult(null)
              try {
                const result = await uploadTask.run((onProgress) => uploadIdPhoto(file, onProgress), {
                  errorMessage: t('upload.failed'),
                })
                setUploadResult(result)
              } catch (err) {
                const apiMsg = getApiErrorMessage(err, '')
                if (apiMsg) uploadTask.setError(apiMsg)
              }
            }}
          >
            {uploadTask.pending ? t('upload.detecting') : t('upload.button')}
          </Button>
        </div>

        {uploadResult ? (
          <div className="space-y-2 rounded-xl border p-4">
            <h2 className="text-sm font-semibold">{t('detection.title')}</h2>
            <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
              <div className="rounded-md bg-muted/60 px-3 py-2">
                {t('detection.imageSize', { width: uploadResult.width, height: uploadResult.height })}
              </div>
              <div className="rounded-md bg-muted/60 px-3 py-2">
                {t('detection.engine', { engine: uploadResult.detection_engine })}
              </div>
              <div className="rounded-md bg-muted/60 px-3 py-2">
                {t('detection.faceCount', { count: uploadResult.faces.length })}
              </div>
              <div className="rounded-md bg-muted/60 px-3 py-2">
                {t('detection.sessionId', { id: uploadResult.upload_id.slice(0, 8) })}
              </div>
            </div>
            {uploadResult.warnings.length > 0 ? (
              <div className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
                {uploadResult.warnings.map((msg, i) => (
                  <p key={i} className="text-xs text-amber-800 dark:text-amber-200">
                    {msg}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-4 rounded-xl border p-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">{t('spec.title')}</h2>
            <p className="text-xs text-muted-foreground">
              {t('spec.hint')}
            </p>
          </div>

          <div className="grid gap-4">
            <SizeStandardPicker
              standards={standards}
              value={selectedStandardCode}
              onChange={(value) => {
                setSelectedStandardCode(value)
                setProcessResult(null)
                setExportResult(null)
                setLayoutResult(null)
              }}
            />
            <BackgroundColorPicker
              value={backgroundColor}
              onChange={(value) => {
                setBackgroundColor(value)
                setProcessResult(null)
              }}
            />
            <ModelTierSelector
              value={modelTier}
              onChange={(value) => {
                setModelTier(value)
                setProcessResult(null)
              }}
            />
          </div>

          {loadingStandards ? <p className="text-xs text-muted-foreground">{t('spec.loadingSpecs')}</p> : null}
          <ProcessingStatus pending={processPending} error={processError} />

          <Button
            type="button"
            className="w-full"
            disabled={!uploadResult || !selectedStandard || processPending}
            onClick={async () => {
              if (!uploadResult || !selectedStandard) return
              setProcessPending(true)
              setProcessError(null)
              setExportError(null)
              setLayoutError(null)
              setExportResult(null)
              setLayoutResult(null)
              try {
                const result = await processIdPhoto({
                  upload_id: uploadResult.upload_id,
                  standard: selectedStandard.code,
                  background_color: backgroundColor,
                  model_tier: modelTier,
                })
                setProcessResult(result)
              } catch (error) {
                setProcessError(getApiErrorMessage(error, t('spec.processingFailed')))
              } finally {
                setProcessPending(false)
              }
            }}
          >
            {processPending ? t('spec.processing') : t('spec.generatePreview')}
          </Button>
        </div>

        {processResult ? (
          <>
            <PhotoPreview
              src={processResult.preview_data_url}
              subtitle={t('spec.previewLabel', {
                name: STANDARD_I18N_MAP[processResult.standard.code]
                  ? t(STANDARD_I18N_MAP[processResult.standard.code])
                  : processResult.standard.name,
                width: processResult.output_width,
                height: processResult.output_height,
                model: processResult.model_used,
              })}
            />

            <ComplianceResults result={processResult.compliance} />

            <div className="space-y-4 rounded-xl border p-4">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold">{t('export.title')}</h2>
                <p className="text-xs text-muted-foreground">
                  {t('export.hint')}
                </p>
              </div>

              <PaywallGate>
                <div className="space-y-3">
                  <BalanceDisplay
                    balance={credits.balance}
                    pending={credits.balancePending}
                    error={credits.balanceError}
                    requiredCredits={1}
                    onRefresh={() => {
                      void credits.refreshAll()
                    }}
                  />

                  <ProcessingStatus pending={exportPending} error={exportError} />
                  <Button
                    type="button"
                    className="w-full"
                    disabled={exportPending || !processResult}
                    onClick={async () => {
                      if (!processResult) return
                      setExportPending(true)
                      setExportError(null)
                      try {
                        const result = await exportIdPhoto(processResult.processed_id)
                        setExportResult(result)
                        void credits.refreshAll()
                      } catch (error) {
                        if (handleInsufficientCredits(error, t('export.exportPhoto'))) {
                          setExportError(getApiErrorMessage(error, t('export.insufficientCredits')))
                        } else {
                          setExportError(getApiErrorMessage(error, t('export.loginRequired')))
                        }
                      } finally {
                        setExportPending(false)
                      }
                    }}
                  >
                    {exportPending ? t('export.exporting') : t('export.exportPhoto')}
                  </Button>

                  {exportResult ? (
                    <div className="rounded-lg border p-3">
                      <p className="mb-2 text-xs text-muted-foreground">
                        {t('export.fileInfo', { filename: exportResult.filename, size: formatBytes(exportResult.size) })}
                      </p>
                      <DownloadButton url={exportResult.download_url} label={t('export.downloadPhoto')} />
                    </div>
                  ) : null}

                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <div className="space-y-2">
                      <Label htmlFor="layoutCopies">{t('export.layoutCount')}</Label>
                      <Input
                        id="layoutCopies"
                        type="number"
                        min={1}
                        max={20}
                        placeholder={String(processResult.standard.layout_default_copies)}
                        value={layoutCopies}
                        onChange={(e) => setLayoutCopies(e.target.value === '' ? '' : Number(e.target.value))}
                      />
                    </div>
                    <Button
                      type="button"
                      className="w-full sm:w-auto sm:self-end"
                      variant="outline"
                      disabled={layoutPending}
                      onClick={async () => {
                        setLayoutPending(true)
                        setLayoutError(null)
                        try {
                          const result = await layoutIdPhoto(
                            processResult.processed_id,
                            layoutCopies === '' ? undefined : layoutCopies,
                          )
                          setLayoutResult(result)
                          void credits.refreshAll()
                        } catch (error) {
                          if (handleInsufficientCredits(error, t('export.generateLayout'))) {
                            setLayoutError(getApiErrorMessage(error, t('export.layoutInsufficientCredits')))
                          } else {
                            setLayoutError(getApiErrorMessage(error, t('export.layoutLoginRequired')))
                          }
                        } finally {
                          setLayoutPending(false)
                        }
                      }}
                    >
                      {layoutPending ? t('export.generatingLayout') : t('export.generateLayout')}
                    </Button>
                  </div>

                  <ProcessingStatus pending={layoutPending} error={layoutError} />
                  <PrintLayoutPreview result={layoutResult} />
                </div>
              </PaywallGate>
            </div>
          </>
        ) : null}

        <InsufficientCreditsDialog
          open={insufficientDialogOpen}
          onOpenChange={setInsufficientDialogOpen}
          requiredCredits={1}
          balance={credits.balance}
          actionLabel={insufficientActionLabel}
          transactions={credits.transactions}
          transactionsPending={credits.transactionsPending}
          transactionsError={credits.transactionsError}
          onRefreshBalance={() => {
            void credits.refreshAll()
          }}
          onRedeemed={() => {
            void credits.refreshAll()
          }}
        />
      </div>
    </ToolPageShell>
    </>
  )
}
