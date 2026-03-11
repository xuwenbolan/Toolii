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
import { Switch } from '@/components/ui/switch'
import { useImageTool } from '@/hooks/useImageTool'
import { formatBytes } from '@/lib/fileValidation'
import { getResultDisplayUrl, upscaleImage } from '@/services/imageApi'

type Scale = 2 | 4

export function UpscalePage() {
  const { t } = useTranslation(['tools', 'common'])
  const [scale, setScale] = useState<Scale>(4)
  const [model, setModel] = useState<'x4plus' | 'x4v3' | 'anime'>('x4plus')
  const [denoiseStrength, setDenoiseStrength] = useState(0.5)
  const [faceEnhance, setFaceEnhance] = useState(false)
  const {
    file, handleFiles, inputPreviewUrl,
    result, resultPanelOpen, openResultPanel, closeResultPanel,
    pending, progress, error, errorMeta, retry,
    runTool, runState,
  } = useImageTool()

  const runUpscale = () => {
    void runTool((f, onProgress) => {
      const opts: Parameters<typeof upscaleImage>[1] = { scale, model }
      if (model === 'x4v3') opts.denoise_strength = denoiseStrength
      if (faceEnhance) opts.face_enhance = true
      return upscaleImage(f, opts, onProgress)
    })
  }

  return (
    <>
      <SEOHead title={t('upscale.seoTitle')} description={t('upscale.seoDescription')} keywords={t('upscale.seoKeywords')} canonicalPath="/image-tools/upscale" jsonLd={[buildToolJsonLd({ name: t('upscale.seoTitle'), description: t('upscale.seoDescription'), url: '/image-tools/upscale' }), buildBreadcrumbJsonLd([{ name: t('common:nav.home'), path: '/' }, { name: t('title'), path: '/image-tools' }, { name: t('upscale.title'), path: '/image-tools/upscale' }])]} />
      <ToolPageShell title={t('upscale.title')} description={t('upscale.description')} toolName="image/upscale" backTo="/image-tools">
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
            <label className="text-sm font-medium">{t('upscale.scaleLabel')}</label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={scale === 2 ? 'secondary' : 'outline'}
                disabled={pending}
                onClick={() => setScale(2)}
              >
                2x
              </Button>
              <Button
                type="button"
                variant={scale === 4 ? 'secondary' : 'outline'}
                disabled={pending}
                onClick={() => setScale(4)}
              >
                4x
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('upscale.modelLabel')}</label>
            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant={model === 'x4plus' ? 'secondary' : 'outline'}
                disabled={pending}
                onClick={() => setModel('x4plus')}
              >
                {t('upscale.modelPhoto')}
              </Button>
              <Button
                type="button"
                variant={model === 'x4v3' ? 'secondary' : 'outline'}
                disabled={pending}
                onClick={() => setModel('x4v3')}
              >
                {t('upscale.modelPhotoV3')}
              </Button>
              <Button
                type="button"
                variant={model === 'anime' ? 'secondary' : 'outline'}
                disabled={pending}
                onClick={() => setModel('anime')}
              >
                {t('upscale.modelAnime')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t(`upscale.modelHint_${model}`)}</p>
          </div>

          {model === 'x4v3' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{t('upscale.denoiseLabel')}</Label>
                <span className="text-sm tabular-nums text-muted-foreground">{Math.round(denoiseStrength * 100)}%</span>
              </div>
              <Slider min={0} max={1} step={0.05} value={[denoiseStrength]} onValueChange={([v]) => setDenoiseStrength(v)} disabled={pending} />
              <p className="text-xs text-muted-foreground">{t('upscale.denoiseHint')}</p>
            </div>
          ) : null}

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('upscale.faceEnhanceLabel')}</Label>
              <p className="text-xs text-muted-foreground">{t('upscale.faceEnhanceHint')}</p>
            </div>
            <Switch checked={faceEnhance} onCheckedChange={setFaceEnhance} disabled={pending} />
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
        toolName="image/upscale"
        ctaLabel={t('upscale.startUpscale')}
        ctaDisabled={!file || pending}
        onCta={runUpscale}
        onViewResult={result ? openResultPanel : undefined}
      />

      <ToolResultPanel open={Boolean(result && resultPanelOpen)} title={t('common:actions.downloadResult')} onClose={closeResultPanel}>
        {result && file ? (
          <ImageResultContent file={file} result={result} inputPreviewUrl={inputPreviewUrl} shareType="upscale" onClose={closeResultPanel} />
        ) : null}
      </ToolResultPanel>
    </>
  )
}
