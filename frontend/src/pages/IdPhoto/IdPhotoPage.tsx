import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BalanceDisplay } from '@/components/credits/BalanceDisplay'
import { InsufficientCreditsDialog } from '@/components/credits/InsufficientCreditsDialog'
import { BackgroundColorPicker } from '@/components/idPhoto/BackgroundColorPicker'
import { ComplianceResults } from '@/components/idPhoto/ComplianceResults'
import { PaywallGate } from '@/components/idPhoto/PaywallGate'
import { PhotoPreview } from '@/components/idPhoto/PhotoPreview'
import { PrintLayoutPreview } from '@/components/idPhoto/PrintLayoutPreview'
import { SizeStandardPicker } from '@/components/idPhoto/SizeStandardPicker'
import { StepIndicator } from '@/components/idPhoto/StepIndicator'
import { UploadQualityPanel } from '@/components/idPhoto/UploadQualityPanel'
import { BeforeAfterPreview } from '@/components/tools/BeforeAfterPreview'
import { DownloadButton } from '@/components/tools/DownloadButton'
import { ProcessingStatus } from '@/components/tools/ProcessingStatus'
import { SEOHead } from '@/components/common/SEOHead'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { ArtifactPreviewCard } from '@/components/tools/ArtifactPreviewCard'
import { UploadProgress } from '@/components/upload/UploadProgress'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PHOTO_STANDARDS_FALLBACK, STANDARD_I18N_MAP } from '@/config/photoStandards'
import { useAuth } from '@/hooks/useAuth'
import { useCredits } from '@/hooks/useCredits'
import { useFileUpload } from '@/hooks/useFileUpload'
import { useObjectUrl } from '@/hooks/useObjectUrl'
import { formatBytes } from '@/lib/fileValidation'
import { isIntInRange, parseFiniteNumber } from '@/lib/numberInput'
import {
  exportIdPhoto,
  fetchPhotoStandards,
  layoutIdPhoto,
  previewIdPhoto,
  type PhotoPreviewResponse,
  type PhotoStandard,
  type PhotoUploadResponse,
  uploadIdPhoto,
} from '@/services/idPhotoApi'
import type { FileResult } from '@/services/imageApi'

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
  const [previewResult, setPreviewResult] = useState<PhotoPreviewResponse | null>(null)
  const [exportResult, setExportResult] = useState<FileResult | null>(null)
  const [layoutResult, setLayoutResult] = useState<FileResult | null>(null)
  const [layoutCopiesInput, setLayoutCopiesInput] = useState('')
  const [backgroundColor, setBackgroundColor] = useState('#FFFFFF')
  const [loadingStandards, setLoadingStandards] = useState(false)
  const [previewPending, setPreviewPending] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [exportPending, setExportPending] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [layoutPending, setLayoutPending] = useState(false)
  const [layoutError, setLayoutError] = useState<string | null>(null)
  const [insufficientDialogOpen, setInsufficientDialogOpen] = useState(false)
  const [insufficientActionLabel, setInsufficientActionLabel] = useState(t('exportAction'))
  const uploadTask = useFileUpload()
  const inputPreviewUrl = useObjectUrl(file)
  const [inputImageMeta, setInputImageMeta] = useState<{ width: number; height: number } | null>(null)

  // AbortController to cancel stale preview requests
  const previewAbortRef = useRef<AbortController | null>(null)

  const STEPS = [
    t('steps.upload'),
    t('steps.adjust'),
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

  useEffect(() => {
    setInputImageMeta(null)
    if (!inputPreviewUrl) return
    let active = true
    const img = new Image()
    img.onload = () => {
      if (!active) return
      setInputImageMeta({
        width: img.naturalWidth,
        height: img.naturalHeight,
      })
    }
    img.onerror = () => {
      if (!active) return
      setInputImageMeta(null)
    }
    img.src = inputPreviewUrl
    return () => {
      active = false
    }
  }, [inputPreviewUrl])

  const currentStep = useMemo(() => {
    if (exportResult || layoutResult) return 2
    if (uploadResult) return 1
    return 0
  }, [uploadResult, exportResult, layoutResult])

  // Detect when upload network transfer is done but server is still processing
  const uploadPhase = useMemo(() => {
    if (!uploadTask.pending) return 'idle' as const
    if (uploadTask.progress !== null && uploadTask.progress >= 100) return 'processing' as const
    return 'uploading' as const
  }, [uploadTask.pending, uploadTask.progress])

  const handleInsufficientCredits = (error: unknown, actionLabel: string) => {
    if (getApiErrorCode(error) !== 'INSUFFICIENT_CREDITS') return false
    setInsufficientActionLabel(actionLabel)
    setInsufficientDialogOpen(true)
    void credits.refreshAll()
    return true
  }

  // Lightweight Phase 2: crop + composite with cached cutout
  const refreshPreview = useCallback(async (uploadId: string, standardCode: string, bgColor: string) => {
    // Cancel any in-flight preview request
    previewAbortRef.current?.abort()
    const controller = new AbortController()
    previewAbortRef.current = controller

    setPreviewPending(true)
    setPreviewError(null)
    setExportResult(null)
    setLayoutResult(null)
    try {
      const result = await previewIdPhoto({
        upload_id: uploadId,
        standard: standardCode,
        background_color: bgColor,
      })
      if (controller.signal.aborted) return
      setPreviewResult(result)
    } catch (err) {
      if (controller.signal.aborted) return
      setPreviewError(t('preview.failed'))
    } finally {
      if (!controller.signal.aborted) {
        setPreviewPending(false)
      }
    }
  }, [t])

  const layoutCopies = parseFiniteNumber(layoutCopiesInput)
  const layoutCopiesValid = layoutCopiesInput.trim() === '' || (layoutCopies != null && isIntInRange(layoutCopies, 1, 20))

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

        {/* Upload section */}
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
              setPreviewError(null)
              setExportError(null)
              setLayoutError(null)
              setUploadResult(null)
              setPreviewResult(null)
              setExportResult(null)
              setLayoutResult(null)
              setFile(files[0])
            }}
          />

          {file ? (
            <ArtifactPreviewCard
              label={t('common:preview.input')}
              filename={file.name}
              sizeText={formatBytes(file.size)}
              mediaKind="image"
              mediaUrl={inputPreviewUrl}
            />
          ) : null}

          <UploadQualityPanel
            file={file}
            imageMeta={inputImageMeta}
            facesDetected={uploadResult ? uploadResult.faces.length : null}
            warnings={uploadResult?.warnings ?? []}
          />

          <ProcessingStatus pending={uploadTask.pending} error={uploadTask.error} />
          {uploadPhase === 'uploading' ? (
            <UploadProgress value={uploadTask.progress} />
          ) : uploadPhase === 'processing' ? (
            <p className="text-xs text-muted-foreground animate-pulse">{t('upload.processing')}</p>
          ) : null}

          <Button
            type="button"
            className="w-full"
            disabled={!file || uploadTask.pending}
            onClick={async () => {
              if (!file) return
              setUploadResult(null)
              setPreviewResult(null)
              setExportResult(null)
              setLayoutResult(null)
              try {
                const result = await uploadTask.run((onProgress) => uploadIdPhoto(file, onProgress), {
                  errorMessage: t('upload.failed'),
                })
                setUploadResult(result)
                // Auto-trigger first preview with current settings
                void refreshPreview(result.upload_id, selectedStandardCode, backgroundColor)
              } catch (err) {
                uploadTask.setError(t('upload.failed'))
              }
            }}
          >
            {uploadTask.pending ? t('upload.detecting') : t('upload.button')}
          </Button>
        </div>

        {/* Adjust & Preview section — shown after upload completes */}
        {uploadResult ? (
          <>
            <div className="space-y-4 rounded-xl border p-4">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold">{t('spec.title')}</h2>
                <p className="text-xs text-muted-foreground">
                  {t('spec.hint')}
                </p>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <SizeStandardPicker
                  standards={standards}
                  value={selectedStandardCode}
                  onChange={(value) => {
                    setSelectedStandardCode(value)
                    void refreshPreview(uploadResult.upload_id, value, backgroundColor)
                  }}
                />
                <BackgroundColorPicker
                  value={backgroundColor}
                  onChange={(value) => {
                    setBackgroundColor(value)
                    void refreshPreview(uploadResult.upload_id, selectedStandardCode, value)
                  }}
                />
              </div>

              {loadingStandards ? <p className="text-xs text-muted-foreground">{t('spec.loadingSpecs')}</p> : null}
            </div>

            {/* Preview + Compliance */}
            <ProcessingStatus pending={previewPending} error={previewError} />

            {previewResult ? (
              <>
                {file && inputPreviewUrl ? (
                  <BeforeAfterPreview
                    beforeFilename={file.name}
                    beforeSizeText={formatBytes(file.size)}
                    beforeUrl={inputPreviewUrl}
                    afterFilename={`${previewResult.standard.code}.jpg`}
                    afterSizeText={`${previewResult.output_width}x${previewResult.output_height}px`}
                    afterUrl={previewResult.preview_data_url}
                  />
                ) : null}
                <PhotoPreview
                  src={previewResult.preview_data_url}
                  subtitle={`${
                    STANDARD_I18N_MAP[previewResult.standard.code]
                      ? t(STANDARD_I18N_MAP[previewResult.standard.code])
                      : previewResult.standard.name
                  } · ${previewResult.output_width}x${previewResult.output_height}px`}
                />

                <ComplianceResults result={previewResult.compliance} />
              </>
            ) : null}

            {/* Export section */}
            {previewResult ? (
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
                      disabled={exportPending || !previewResult}
                      onClick={async () => {
                        if (!previewResult) return
                        setExportPending(true)
                        setExportError(null)
                        try {
                          const result = await exportIdPhoto(previewResult.processed_id)
                          setExportResult(result)
                          void credits.refreshAll()
                        } catch (error) {
                          if (handleInsufficientCredits(error, t('export.exportPhoto'))) {
                            setExportError(t('export.insufficientCredits'))
                          } else {
                            setExportError(t('export.loginRequired'))
                          }
                        } finally {
                          setExportPending(false)
                        }
                      }}
                    >
                      {exportPending ? t('export.exporting') : t('export.exportPhoto')}
                    </Button>

                    {exportResult ? (
                      <ArtifactPreviewCard
                        label={t('common:preview.output')}
                        filename={exportResult.filename}
                        sizeText={formatBytes(exportResult.size)}
                        mediaKind="image"
                        mediaUrl={exportResult.download_url}
                        action={
                          <DownloadButton
                            url={exportResult.download_url}
                            label={t('export.downloadPhoto')}
                            className="w-auto"
                          />
                        }
                      />
                    ) : null}

                    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                      <div className="space-y-2">
                        <Label htmlFor="layoutCopies">{t('export.layoutCount')}</Label>
                        <Input
                          id="layoutCopies"
                          type="number"
                          min={1}
                          max={20}
                          placeholder={String(previewResult.standard.layout_default_copies)}
                          value={layoutCopiesInput}
                          onChange={(e) => setLayoutCopiesInput(e.target.value)}
                        />
                      </div>
                      <Button
                        type="button"
                        className="w-full sm:w-auto sm:self-end"
                        variant="outline"
                        disabled={layoutPending || !layoutCopiesValid}
                        onClick={async () => {
                          if (!layoutCopiesValid) return
                          setLayoutPending(true)
                          setLayoutError(null)
                          try {
                            const result = await layoutIdPhoto(
                              previewResult.processed_id,
                              layoutCopiesInput.trim() === '' ? undefined : (layoutCopies ?? undefined),
                            )
                            setLayoutResult(result)
                            void credits.refreshAll()
                          } catch (error) {
                            if (handleInsufficientCredits(error, t('export.generateLayout'))) {
                              setLayoutError(t('export.layoutInsufficientCredits'))
                            } else {
                              setLayoutError(t('export.layoutLoginRequired'))
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
            ) : null}
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
