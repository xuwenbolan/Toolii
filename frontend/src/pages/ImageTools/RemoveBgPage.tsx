import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SEOHead } from '@/components/common/SEOHead'
import { buildBreadcrumbJsonLd, buildToolJsonLd } from '@/lib/jsonLd'
import { GatedDownloadButton } from '@/components/tools/GatedDownloadButton'
import { ImageResultContent } from '@/components/tools/ImageResultContent'
import { ToolActionBar } from '@/components/tools/ToolActionBar'
import { ToolErrorBanner } from '@/components/tools/ToolErrorBanner'
import { ToolResultPanel } from '@/components/tools/ToolResultPanel'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { ToolWorkspaceDropzone } from '@/components/tools/ToolWorkspaceDropzone'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useImageTool } from '@/hooks/useImageTool'
import { cn } from '@/lib/utils'
import { getResultDisplayUrl, removeBackground } from '@/services/imageApi'

type BgMode = 'transparent' | 'white' | 'custom'

export function RemoveBgPage() {
  const { t } = useTranslation(['tools', 'common'])
  const [bgModel, setBgModel] = useState<'general' | 'portrait' | 'matting'>('general')
  const [bgMode, setBgMode] = useState<BgMode>('transparent')
  const [customBgColor, setCustomBgColor] = useState('#dbeafe')
  const [showOriginalPreview, setShowOriginalPreview] = useState(false)
  const {
    file, handleFiles, inputPreviewUrl,
    result, resultPanelOpen, openResultPanel, closeResultPanel,
    pending, progress, error, errorMeta, retry,
    runTool, runState,
  } = useImageTool()

  const runRemoveBg = () => {
    void runTool((f, onProgress) => removeBackground(f, { model: bgModel }, onProgress))
  }

  return (
    <>
      <SEOHead title={t('removeBg.seoTitle')} description={t('removeBg.seoDescription')} keywords={t('removeBg.seoKeywords')} canonicalPath="/image-tools/remove-bg" jsonLd={[buildToolJsonLd({ name: t('removeBg.seoTitle'), description: t('removeBg.seoDescription'), url: '/image-tools/remove-bg' }), buildBreadcrumbJsonLd([{ name: t('common:nav.home'), path: '/' }, { name: t('title'), path: '/image-tools' }, { name: t('removeBg.title'), path: '/image-tools/remove-bg' }])]} />
      <ToolPageShell title={t('removeBg.title')} description={t('removeBg.description')} toolName="image/remove-bg" backTo="/image-tools" width="wide" layout="split">
        <div className="space-y-5">
          <ToolWorkspaceDropzone
            accept={{ 'image/*': [] }}
            multiple={false}
            maxFiles={1}
            onFiles={(files) => {
              handleFiles(files)
              setShowOriginalPreview(false)
            }}
            title={t('removeBg.dropTitle', t('common:upload.dropHere'))}
            hint={t('removeBg.dropHint', t('common:upload.orSelectBelow'))}
          />

          <ToolErrorBanner error={error} errorMeta={errorMeta} onRetry={file ? () => retry() : undefined} />

          {file && (result || inputPreviewUrl) ? (
            <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">{t('removeBg.previewTitle')}</p>
                {result && inputPreviewUrl ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onPointerDown={() => setShowOriginalPreview(true)}
                    onPointerUp={() => setShowOriginalPreview(false)}
                    onPointerLeave={() => setShowOriginalPreview(false)}
                    onPointerCancel={() => setShowOriginalPreview(false)}
                  >
                    {t('removeBg.showOriginalHold')}
                  </Button>
                ) : null}
              </div>

              <div
                className={cn(
                  'relative overflow-hidden rounded-lg border border-border/70 p-3',
                  bgMode === 'transparent' && !showOriginalPreview
                    ? 'bg-[linear-gradient(45deg,rgba(120,120,120,0.12)_25%,transparent_25%,transparent_75%,rgba(120,120,120,0.12)_75%,rgba(120,120,120,0.12)),linear-gradient(45deg,rgba(120,120,120,0.12)_25%,transparent_25%,transparent_75%,rgba(120,120,120,0.12)_75%,rgba(120,120,120,0.12))] [background-position:0_0,10px_10px] [background-size:20px_20px]'
                    : 'bg-muted/15',
                )}
                style={{
                  backgroundColor:
                    !showOriginalPreview && bgMode === 'white'
                      ? '#ffffff'
                      : !showOriginalPreview && bgMode === 'custom'
                        ? customBgColor
                        : undefined,
                }}
              >
                <div className="flex min-h-[16rem] items-center justify-center sm:min-h-[20rem]">
                  {showOriginalPreview ? (
                    inputPreviewUrl ? (
                      <img
                        src={inputPreviewUrl}
                        alt={file.name}
                        className="max-h-[60vh] w-full rounded-md object-contain"
                      />
                    ) : null
                  ) : result ? (
                    <img
                      src={getResultDisplayUrl(result)}
                      alt={result.filename}
                      className="max-h-[60vh] w-full rounded-md object-contain"
                    />
                  ) : inputPreviewUrl ? (
                    <img
                      src={inputPreviewUrl}
                      alt={file.name}
                      className="max-h-[60vh] w-full rounded-md object-contain opacity-70"
                    />
                  ) : null}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
                <div className="space-y-2">
                  <Label>{t('removeBg.backgroundLabel')}</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={bgMode === 'transparent' ? 'secondary' : 'outline'}
                      onClick={() => setBgMode('transparent')}
                    >
                      {t('removeBg.backgroundTransparent')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={bgMode === 'white' ? 'secondary' : 'outline'}
                      onClick={() => setBgMode('white')}
                    >
                      {t('removeBg.backgroundWhite')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={bgMode === 'custom' ? 'secondary' : 'outline'}
                      onClick={() => setBgMode('custom')}
                    >
                      {t('removeBg.backgroundCustom')}
                    </Button>
                    {bgMode === 'custom' ? (
                      <input
                        type="color"
                        value={customBgColor}
                        onChange={(event) => setCustomBgColor(event.target.value)}
                        className="h-8 w-10 cursor-pointer rounded border border-border bg-background p-1"
                        aria-label={t('removeBg.backgroundCustom')}
                      />
                    ) : null}
                  </div>
                </div>

                {result ? (
                  <GatedDownloadButton result={result} size="sm" className="w-auto" />
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>{t('removeBg.modelLabel')}</Label>
            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                size="sm"
                variant={bgModel === 'general' ? 'secondary' : 'outline'}
                disabled={pending}
                onClick={() => setBgModel('general')}
              >
                {t('removeBg.modelGeneral')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={bgModel === 'portrait' ? 'secondary' : 'outline'}
                disabled={pending}
                onClick={() => setBgModel('portrait')}
              >
                {t('removeBg.modelPortrait')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={bgModel === 'matting' ? 'secondary' : 'outline'}
                disabled={pending}
                onClick={() => setBgModel('matting')}
              >
                {t('removeBg.modelMatting')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t(`removeBg.modelHint_${bgModel}`)}</p>
          </div>

          <p className="text-xs text-muted-foreground">{t('removeBg.outputHint')}</p>
        </div>
      </ToolPageShell>

      <ToolActionBar
        mode="manual"
        status={runState.statusText}
        pending={pending}
        progress={progress}
        error={error}
        done={runState.phase === 'done'}
        toolName="image/remove-bg"
        ctaLabel={t('removeBg.startProcess')}
        ctaDisabled={!file || pending}
        onCta={runRemoveBg}
        onViewResult={result ? openResultPanel : undefined}
      />

      <ToolResultPanel
        open={Boolean(result && resultPanelOpen)}
        title={t('common:actions.downloadResult')}
        onClose={closeResultPanel}
      >
        {result && file ? (
          <ImageResultContent file={file} result={result} inputPreviewUrl={inputPreviewUrl} shareType="remove_bg" onClose={closeResultPanel} />
        ) : null}
      </ToolResultPanel>
    </>
  )
}
