import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ArtifactPreviewCard } from '@/components/tools/ArtifactPreviewCard'
import { GatedDownloadButton } from '@/components/tools/GatedDownloadButton'
import { ImageResultContent } from '@/components/tools/ImageResultContent'
import { ToolActionBar } from '@/components/tools/ToolActionBar'
import { ToolErrorBanner } from '@/components/tools/ToolErrorBanner'
import { ToolResultPanel } from '@/components/tools/ToolResultPanel'
import { SEOHead } from '@/components/common/SEOHead'
import { buildBreadcrumbJsonLd, buildToolJsonLd } from '@/lib/jsonLd'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { ToolWorkspaceDropzone } from '@/components/tools/ToolWorkspaceDropzone'
import { Button } from '@/components/ui/button'
import { useImageTool } from '@/hooks/useImageTool'
import { formatBytes } from '@/lib/fileValidation'
import { enhanceScan, getResultDisplayUrl } from '@/services/imageApi'

type Mode = 'bw' | 'color'

export function ScanEnhancePage() {
  const { t } = useTranslation(['tools', 'common'])
  const [mode, setMode] = useState<Mode>('bw')
  const {
    file, handleFiles, inputPreviewUrl,
    result, resultPanelOpen, openResultPanel, closeResultPanel,
    pending, progress, error, errorMeta, retry,
    runTool, runState,
  } = useImageTool()

  const runEnhance = () => {
    void runTool((f, onProgress) => enhanceScan(f, { mode }, onProgress))
  }

  return (
    <>
      <SEOHead title={t('scanEnhance.seoTitle')} description={t('scanEnhance.seoDescription')} keywords={t('scanEnhance.seoKeywords')} canonicalPath="/image-tools/scan-enhance" jsonLd={[buildToolJsonLd({ name: t('scanEnhance.seoTitle'), description: t('scanEnhance.seoDescription'), url: '/image-tools/scan-enhance' }), buildBreadcrumbJsonLd([{ name: t('common:nav.home'), path: '/' }, { name: t('title'), path: '/image-tools' }, { name: t('scanEnhance.title'), path: '/image-tools/scan-enhance' }])]} />
      <ToolPageShell title={t('scanEnhance.title')} description={t('scanEnhance.description')} toolName="image/scan-enhance" backTo="/image-tools">
      <div className="space-y-5">
        <ToolWorkspaceDropzone
          accept={{ 'image/*': [] }}
          multiple={false}
          onFiles={handleFiles}
        />
        <ToolErrorBanner error={error} errorMeta={errorMeta} onRetry={file ? () => retry() : undefined} />

        {file ? (
          <ArtifactPreviewCard
            label={result ? t('common:preview.output') : t('common:preview.input')}
            filename={result ? result.filename : file.name}
            sizeText={result ? formatBytes(result.size) : formatBytes(file.size)}
            mediaKind="image"
            mediaUrl={result ? getResultDisplayUrl(result) : inputPreviewUrl}
            action={result ? <GatedDownloadButton result={result} size="sm" className="w-auto" /> : undefined}
            protectedPreview={result?.requires_credit}
          />
        ) : null}

        <div className="space-y-2">
          <label className="text-sm font-medium">{t('scanEnhance.outputMode')}</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant={mode === 'bw' ? 'secondary' : 'outline'}
              disabled={pending}
              onClick={() => setMode('bw')}
            >
              {t('scanEnhance.bw')}
            </Button>
            <Button
              type="button"
              variant={mode === 'color' ? 'secondary' : 'outline'}
              disabled={pending}
              onClick={() => setMode('color')}
            >
              {t('scanEnhance.color')}
            </Button>
          </div>
        </div>
      </div>
    </ToolPageShell>

    <ToolActionBar
      mode="manual"
      status={runState.statusText}
      pending={pending}
      progress={progress}
      error={error}
      done={runState.phase === 'done'}
      toolName="image/scan-enhance"
      ctaLabel={t('scanEnhance.startProcess')}
      ctaDisabled={!file || pending}
      onCta={runEnhance}
      onViewResult={result ? openResultPanel : undefined}
    />

    <ToolResultPanel
      open={Boolean(result && resultPanelOpen)}
      title={t('common:actions.downloadResult')}
      onClose={closeResultPanel}
    >
      {result && file ? (
        <ImageResultContent file={file} result={result} inputPreviewUrl={inputPreviewUrl} shareType="scan_enhance" onClose={closeResultPanel} />
      ) : null}
    </ToolResultPanel>
    </>
  )
}
