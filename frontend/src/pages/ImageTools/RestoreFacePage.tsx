import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SEOHead } from '@/components/common/SEOHead'
import { buildBreadcrumbJsonLd, buildToolJsonLd } from '@/lib/jsonLd'
import { ArtifactPreviewCard } from '@/components/tools/ArtifactPreviewCard'
import { GatedDownloadButton } from '@/components/tools/GatedDownloadButton'
import { ImageResultContent } from '@/components/tools/ImageResultContent'
import { ToolActionBar } from '@/components/tools/ToolActionBar'
import { ToolErrorBanner } from '@/components/tools/ToolErrorBanner'
import { ToolResultPanel } from '@/components/tools/ToolResultPanel'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { ToolWorkspaceDropzone } from '@/components/tools/ToolWorkspaceDropzone'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { useImageTool } from '@/hooks/useImageTool'
import { formatBytes } from '@/lib/fileValidation'
import { getResultDisplayUrl, restoreFace } from '@/services/imageApi'

export function RestoreFacePage() {
  const { t } = useTranslation(['tools', 'common'])
  const [w, setW] = useState(0.5)
  const [upscale, setUpscale] = useState<1 | 2>(2)
  const {
    file, handleFiles, inputPreviewUrl,
    result, resultPanelOpen, openResultPanel, closeResultPanel,
    pending, progress, error, errorMeta, retry,
    runTool, runState,
  } = useImageTool()

  const runRestore = () => {
    void runTool((f, onProgress) => restoreFace(f, { w, upscale }, onProgress))
  }

  return (
    <>
      <SEOHead title={t('restoreFace.seoTitle')} description={t('restoreFace.seoDescription')} keywords={t('restoreFace.seoKeywords')} canonicalPath="/image-tools/restore-face" jsonLd={[buildToolJsonLd({ name: t('restoreFace.seoTitle'), description: t('restoreFace.seoDescription'), url: '/image-tools/restore-face' }), buildBreadcrumbJsonLd([{ name: t('common:nav.home'), path: '/' }, { name: t('title'), path: '/image-tools' }, { name: t('restoreFace.title'), path: '/image-tools/restore-face' }])]} />
      <ToolPageShell title={t('restoreFace.title')} description={t('restoreFace.description')} toolName="image/restore-face" backTo="/image-tools">
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

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>{t('restoreFace.fidelityLabel')}</Label>
              <span className="text-sm tabular-nums text-muted-foreground">{Math.round(w * 100)}%</span>
            </div>
            <Slider min={0} max={1} step={0.05} value={[w]} onValueChange={([v]) => setW(v)} disabled={pending} />
            <p className="text-xs text-muted-foreground">{t('restoreFace.fidelityHint')}</p>
          </div>

          <div className="space-y-2">
            <Label>{t('restoreFace.upscaleLabel')}</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={upscale === 1 ? 'secondary' : 'outline'}
                disabled={pending}
                onClick={() => setUpscale(1)}
              >
                {t('restoreFace.upscaleNone')}
              </Button>
              <Button
                type="button"
                variant={upscale === 2 ? 'secondary' : 'outline'}
                disabled={pending}
                onClick={() => setUpscale(2)}
              >
                {t('restoreFace.upscale2x')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('restoreFace.upscaleHint')}</p>
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
        toolName="image/restore-face"
        ctaLabel={t('restoreFace.startRestore')}
        ctaDisabled={!file || pending}
        onCta={runRestore}
        onViewResult={result ? openResultPanel : undefined}
      />

      <ToolResultPanel open={Boolean(result && resultPanelOpen)} title={t('common:actions.downloadResult')} onClose={closeResultPanel}>
        {result && file ? (
          <ImageResultContent file={file} result={result} inputPreviewUrl={inputPreviewUrl} shareType="restore_face" onClose={closeResultPanel} />
        ) : null}
      </ToolResultPanel>
    </>
  )
}
