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
import { denoiseImage, getResultDisplayUrl } from '@/services/imageApi'

export function DenoisePage() {
  const { t } = useTranslation(['tools', 'common'])
  const [strength, setStrength] = useState(0.5)
  const [task, setTask] = useState<'denoise' | 'deblur'>('denoise')
  const [modelWidth, setModelWidth] = useState<32 | 64>(64)
  const {
    file, handleFiles, inputPreviewUrl,
    result, resultPanelOpen, openResultPanel, closeResultPanel,
    pending, progress, error, errorMeta, retry,
    runTool, runState,
  } = useImageTool()

  const runDenoise = () => {
    void runTool((f, onProgress) => denoiseImage(f, { strength, task, model_width: modelWidth }, onProgress))
  }

  return (
    <>
      <SEOHead title={t('denoise.seoTitle')} description={t('denoise.seoDescription')} keywords={t('denoise.seoKeywords')} canonicalPath="/image-tools/denoise" jsonLd={[buildToolJsonLd({ name: t('denoise.seoTitle'), description: t('denoise.seoDescription'), url: '/image-tools/denoise' }), buildBreadcrumbJsonLd([{ name: t('common:nav.home'), path: '/' }, { name: t('title'), path: '/image-tools' }, { name: t('denoise.title'), path: '/image-tools/denoise' }])]} />
      <ToolPageShell title={t('denoise.title')} description={t('denoise.description')} toolName="image/denoise" backTo="/image-tools">
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
            <Label>{t('denoise.taskLabel')}</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={task === 'denoise' ? 'secondary' : 'outline'}
                disabled={pending}
                onClick={() => setTask('denoise')}
              >
                {t('denoise.taskDenoise')}
              </Button>
              <Button
                type="button"
                variant={task === 'deblur' ? 'secondary' : 'outline'}
                disabled={pending}
                onClick={() => setTask('deblur')}
              >
                {t('denoise.taskDeblur')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {task === 'denoise' ? t('denoise.taskDenoiseHint') : t('denoise.taskDeblurHint')}
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>{t('denoise.strengthLabel')}</Label>
              <span className="text-sm tabular-nums text-muted-foreground">{Math.round(strength * 100)}%</span>
            </div>
            <Slider min={0} max={1} step={0.05} value={[strength]} onValueChange={([v]) => setStrength(v)} disabled={pending} />
            <p className="text-xs text-muted-foreground">{t('denoise.strengthHint')}</p>
          </div>

          <div className="space-y-2">
            <Label>{t('denoise.qualityLabel')}</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={modelWidth === 64 ? 'secondary' : 'outline'}
                disabled={pending}
                onClick={() => setModelWidth(64)}
              >
                {t('denoise.qualityHigh')}
              </Button>
              <Button
                type="button"
                variant={modelWidth === 32 ? 'secondary' : 'outline'}
                disabled={pending}
                onClick={() => setModelWidth(32)}
              >
                {t('denoise.qualityFast')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('denoise.qualityHint')}</p>
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
        toolName="image/denoise"
        ctaLabel={t('denoise.startDenoise')}
        ctaDisabled={!file || pending}
        onCta={runDenoise}
        onViewResult={result ? openResultPanel : undefined}
      />

      <ToolResultPanel open={Boolean(result && resultPanelOpen)} title={t('common:actions.downloadResult')} onClose={closeResultPanel}>
        {result && file ? (
          <ImageResultContent file={file} result={result} inputPreviewUrl={inputPreviewUrl} shareType="denoise" onClose={closeResultPanel} />
        ) : null}
      </ToolResultPanel>
    </>
  )
}
