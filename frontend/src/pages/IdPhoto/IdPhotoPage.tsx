import { useTranslation } from 'react-i18next'

import { InsufficientCreditsDialog } from '@/components/credits/InsufficientCreditsDialog'
import { BackgroundColorPicker } from '@/components/idPhoto/BackgroundColorPicker'
import { ComplianceResults } from '@/components/idPhoto/ComplianceResults'
import { PhotoPreview } from '@/components/idPhoto/PhotoPreview'
import { PrintLayoutPreview } from '@/components/idPhoto/PrintLayoutPreview'
import { PrintLayoutSimulator } from '@/components/idPhoto/PrintLayoutSimulator'
import { SizeStandardPicker } from '@/components/idPhoto/SizeStandardPicker'
import { UploadQualityPanel } from '@/components/idPhoto/UploadQualityPanel'
import { SEOHead } from '@/components/common/SEOHead'
import { DownloadButton } from '@/components/tools/DownloadButton'
import { ProcessingStatus } from '@/components/tools/ProcessingStatus'
import { ToolActionBar } from '@/components/tools/ToolActionBar'
import { ToolErrorBanner } from '@/components/tools/ToolErrorBanner'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { ToolResultPanel } from '@/components/tools/ToolResultPanel'
import { ArtifactPreviewCard } from '@/components/tools/ArtifactPreviewCard'
import { UploadProgress } from '@/components/upload/UploadProgress'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { STANDARD_I18N_MAP } from '@/config/photoStandards'
import { buildBreadcrumbJsonLd, buildToolJsonLd } from '@/lib/jsonLd'
import { formatBytes } from '@/lib/fileValidation'
import { isIntInRange, parseFiniteNumber } from '@/lib/numberInput'

import { useIdPhotoState } from './useIdPhotoState'

export function IdPhotoPage() {
  const { t } = useTranslation('idPhoto')

  const {
    state,
    dispatch,
    isPaid,
    actionPending,
    selectedStandard,
    uploadPhase,
    inputPreviewUrl,
    inputImageMeta,
    isAuthenticated,
    credits,
    uploadTask,
    handleFileSelect,
    handleUpload,
    handleExport,
    handleGenerateLayout,
    handleStandardChange,
    handleBgColorChange,
    handleAdjustChange,
    handleAdjustCommit,
    handleAdjustSlider,
    handleAdjustReset,
  } = useIdPhotoState()

  const {
    file,
    standards,
    selectedStandardCode,
    backgroundColor,
    loadingStandards,
    uploadResult,
    previewResult,
    previewPending,
    previewError,
    photoAdjust,
    layoutCopiesInput,
    exportResult,
    layoutResult,
    exportPending,
    actionError,
    resultPanelOpen,
    resultPanelKind,
    insufficientDialogOpen,
    insufficientActionLabel,
  } = state

  // Layout copies validation
  const layoutCopies = parseFiniteNumber(layoutCopiesInput)
  const layoutCopiesValid = layoutCopiesInput.trim() === '' || (layoutCopies != null && isIntInRange(layoutCopies, 1, 20))
  const canAction = Boolean(previewResult && isAuthenticated && !actionPending)

  // ActionBar status text
  const actionStatus = actionError
    ? actionError
    : actionPending
      ? (exportPending ? t('export.exporting') : t('export.generatingLayout'))
      : !previewResult
        ? t('export.hint')
        : !isAuthenticated
          ? t('paywall.description')
          : isPaid
            ? t('export.exported')
            : t('export.creditHint')

  // Preview subtitle
  const previewSubtitle = previewResult
    ? `${
        STANDARD_I18N_MAP[previewResult.standard.code]
          ? t(STANDARD_I18N_MAP[previewResult.standard.code])
          : previewResult.standard.name
      } · ${previewResult.output_width}x${previewResult.output_height}px`
    : ''

  return (
    <>
      <SEOHead
        title={t('seo.title')}
        description={t('seo.description')}
        keywords={t('seo.keywords')}
        canonicalPath="/id-photo"
        jsonLd={[buildToolJsonLd({ name: t('seo.title'), description: t('seo.description'), url: '/id-photo' }), buildBreadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: t('title'), path: '/id-photo' }])]}
      />

      <ToolPageShell title={t('title')} description={t('workflow')} backTo="/" width="wide">
        <div className="space-y-5">

          {/* ── Upload section ────────────────────────────────────── */}
          {!uploadResult ? (
            <div className="space-y-3 rounded-xl border p-4">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold">{t('upload.title')}</h2>
                <p className="text-xs text-muted-foreground">{t('upload.hint')}</p>
              </div>

              <FileDropzone accept="image/*" onFiles={handleFileSelect} />

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
                facesDetected={null}
                warnings={[]}
              />

              <ProcessingStatus pending={uploadTask.pending} error={uploadTask.error} />
              <ToolErrorBanner
                error={uploadTask.error}
                errorMeta={uploadTask.errorMeta}
                onRetry={file ? () => uploadTask.retry() : undefined}
              />
              {uploadPhase === 'uploading' ? (
                <UploadProgress value={uploadTask.progress} />
              ) : uploadPhase === 'processing' ? (
                <p className="text-xs text-muted-foreground animate-pulse">{t('upload.processing')}</p>
              ) : null}

              <Button
                type="button"
                className="w-full"
                disabled={!file || uploadTask.pending}
                onClick={() => void handleUpload()}
              >
                {uploadTask.pending ? t('upload.detecting') : t('upload.button')}
              </Button>
            </div>
          ) : (
            /* Compact file card after upload */
            <div className="flex items-center gap-3 rounded-xl border p-3">
              {inputPreviewUrl ? (
                <img
                  src={inputPreviewUrl}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-md border object-cover"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file?.name}</p>
                <p className="text-xs text-muted-foreground">{file ? formatBytes(file.size) : ''}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => dispatch({ type: 'RESET_FOR_NEW_FILE' })}
              >
                {t('upload.changePhoto')}
              </Button>
            </div>
          )}

          {/* ── Settings: spec + bg color ─────────────────────────── */}
          {uploadResult ? (
            <div className="space-y-3 rounded-xl border p-4">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold">{t('spec.title')}</h2>
                <p className="text-xs text-muted-foreground">{t('spec.hint')}</p>
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                <SizeStandardPicker
                  standards={standards}
                  value={selectedStandardCode}
                  onChange={handleStandardChange}
                />
                <BackgroundColorPicker
                  value={backgroundColor}
                  onChange={handleBgColorChange}
                />
              </div>
              {loadingStandards ? (
                <p className="text-xs text-muted-foreground">{t('spec.loadingSpecs')}</p>
              ) : null}
            </div>
          ) : null}

          {/* ── Preview loading ───────────────────────────────────── */}
          {uploadResult ? (
            <ProcessingStatus pending={previewPending} error={previewError} />
          ) : null}

          {/* ── Preview area ──────────────────────────────────────── */}
          {previewResult && selectedStandard ? (
            <>
              {/* Desktop: side-by-side */}
              <div className="hidden lg:grid lg:grid-cols-2 lg:gap-4">
                <div className="space-y-3 rounded-xl border p-4">
                  <h3 className="text-sm font-semibold">{t('preview.title')}</h3>
                  <PhotoPreview
                    src={previewResult.preview_data_url}
                    subtitle={previewSubtitle}
                    guide={{
                      topMarginRatio: previewResult.standard.top_margin_ratio,
                      faceHeightRatio: previewResult.standard.face_height_ratio,
                    }}
                    adjust={photoAdjust}
                    onAdjustChange={handleAdjustChange}
                    onAdjustCommit={handleAdjustCommit}
                  />
                </div>
                <div className="space-y-3 rounded-xl border p-4">
                  <h3 className="text-sm font-semibold">{t('preview.tabLayout')}</h3>
                  <PrintLayoutSimulator
                    previewDataUrl={previewResult.preview_data_url}
                    photoWidthMm={selectedStandard.width_mm}
                    photoHeightMm={selectedStandard.height_mm}
                  />
                </div>
              </div>

              {/* Mobile: tabs */}
              <div className="lg:hidden">
                <Tabs defaultValue="single">
                  <TabsList className="w-full">
                    <TabsTrigger value="single" className="flex-1">{t('preview.tabSingle')}</TabsTrigger>
                    <TabsTrigger value="layout" className="flex-1">{t('preview.tabLayout')}</TabsTrigger>
                  </TabsList>
                  <TabsContent value="single">
                    <div className="space-y-3 rounded-xl border p-4">
                      <PhotoPreview
                        src={previewResult.preview_data_url}
                        subtitle={previewSubtitle}
                        guide={{
                          topMarginRatio: previewResult.standard.top_margin_ratio,
                          faceHeightRatio: previewResult.standard.face_height_ratio,
                        }}
                        adjust={photoAdjust}
                        onAdjustChange={handleAdjustChange}
                        onAdjustCommit={handleAdjustCommit}
                      />
                    </div>
                  </TabsContent>
                  <TabsContent value="layout">
                    <div className="space-y-3 rounded-xl border p-4">
                      <PrintLayoutSimulator
                        previewDataUrl={previewResult.preview_data_url}
                        photoWidthMm={selectedStandard.width_mm}
                        photoHeightMm={selectedStandard.height_mm}
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              </div>

              {/* ── Adjust sliders ──────────────────────────────────── */}
              <div className="space-y-3 rounded-xl border p-4">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold">{t('adjust.title')}</h3>
                  <p className="text-xs text-muted-foreground">{t('adjust.hint')}</p>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="adjustScale" className="text-xs text-muted-foreground">{t('adjust.scale')}</Label>
                    <input
                      id="adjustScale"
                      type="range"
                      min={75}
                      max={240}
                      step={1}
                      value={Math.round(photoAdjust.scale * 100)}
                      onChange={(e) => handleAdjustSlider('scale', Number(e.target.value) / 100)}
                      className="w-full accent-primary"
                    />
                    <p className="text-xs tabular-nums">{Math.round(photoAdjust.scale * 100)}%</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="adjustOffsetX" className="text-xs text-muted-foreground">{t('adjust.horizontal')}</Label>
                    <input
                      id="adjustOffsetX"
                      type="range"
                      min={-45}
                      max={45}
                      step={1}
                      value={Math.round(photoAdjust.offsetX * 100)}
                      onChange={(e) => handleAdjustSlider('offsetX', Number(e.target.value) / 100)}
                      className="w-full accent-primary"
                    />
                    <p className="text-xs tabular-nums">{Math.round(photoAdjust.offsetX * 100)}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="adjustOffsetY" className="text-xs text-muted-foreground">{t('adjust.vertical')}</Label>
                    <input
                      id="adjustOffsetY"
                      type="range"
                      min={-45}
                      max={45}
                      step={1}
                      value={Math.round(photoAdjust.offsetY * 100)}
                      onChange={(e) => handleAdjustSlider('offsetY', Number(e.target.value) / 100)}
                      className="w-full accent-primary"
                    />
                    <p className="text-xs tabular-nums">{Math.round(photoAdjust.offsetY * 100)}</p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAdjustReset}
                  disabled={previewPending}
                >
                  {t('adjust.reset')}
                </Button>
              </div>

              {/* ── Layout copies input ─────────────────────────────── */}
              {isAuthenticated ? (
                <div className="flex items-end gap-3 rounded-xl border p-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="layoutCopies" className="text-xs">{t('export.layoutCount')}</Label>
                    <Input
                      id="layoutCopies"
                      type="number"
                      min={1}
                      max={20}
                      placeholder={String(previewResult.standard.layout_default_copies)}
                      value={layoutCopiesInput}
                      disabled={actionPending}
                      onChange={(e) => dispatch({ type: 'SET_LAYOUT_COPIES', value: e.target.value })}
                      className="w-28"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground pb-1">
                    {t('export.creditHint')}
                  </p>
                </div>
              ) : null}

              {/* ── Compliance ──────────────────────────────────────── */}
              <ComplianceResults result={previewResult.compliance} />
            </>
          ) : null}

          {/* ── Insufficient credits dialog ─────────────────────── */}
          <InsufficientCreditsDialog
            open={insufficientDialogOpen}
            onOpenChange={(open) => dispatch({ type: 'SET_INSUFFICIENT_DIALOG', open })}
            requiredCredits={1}
            balance={credits.balance}
            actionLabel={insufficientActionLabel}
            transactions={credits.transactions}
            transactionsPending={credits.transactionsPending}
            transactionsError={credits.transactionsError}
            onRefreshBalance={() => void credits.refreshAll()}
            onRedeemed={() => void credits.refreshAll()}
          />
        </div>
      </ToolPageShell>

      {/* ── Action bar ─────────────────────────────────────────── */}
      {previewResult ? (
        <ToolActionBar
          mode="manual"
          status={actionStatus}
          pending={actionPending}
          error={actionError}
          done={isPaid}
          secondaryCtaLabel={
            isAuthenticated
              ? (isPaid ? t('export.downloadLayout') : t('export.exportLayout'))
              : undefined
          }
          secondaryCtaDisabled={!canAction || !layoutCopiesValid}
          onSecondaryCta={
            isAuthenticated
              ? () => void handleGenerateLayout()
              : undefined
          }
          ctaLabel={
            isAuthenticated
              ? (isPaid ? t('export.downloadSingle') : t('export.exportSingle'))
              : undefined
          }
          ctaDisabled={!canAction}
          onCta={
            isAuthenticated
              ? () => void handleExport()
              : undefined
          }
        />
      ) : null}

      {/* ── Result panel ───────────────────────────────────────── */}
      <ToolResultPanel
        open={resultPanelOpen}
        title={t('export.title')}
        onClose={() => dispatch({ type: 'CLOSE_RESULT_PANEL' })}
      >
        {resultPanelKind === 'export' && exportResult ? (
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
        {resultPanelKind === 'layout' && layoutResult ? (
          <PrintLayoutPreview result={layoutResult} />
        ) : null}
      </ToolResultPanel>
    </>
  )
}
