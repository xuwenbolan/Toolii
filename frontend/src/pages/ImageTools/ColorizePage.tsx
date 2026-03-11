import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SEOHead } from '@/components/common/SEOHead'
import { buildBreadcrumbJsonLd, buildToolJsonLd } from '@/lib/jsonLd'
import { ArtifactPreviewCard } from '@/components/tools/ArtifactPreviewCard'
import { ImageResultContent } from '@/components/tools/ImageResultContent'
import { GatedDownloadButton } from '@/components/tools/GatedDownloadButton'
import { ToolActionBar } from '@/components/tools/ToolActionBar'
import { ToolErrorBanner } from '@/components/tools/ToolErrorBanner'
import { ToolResultPanel } from '@/components/tools/ToolResultPanel'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { ToolWorkspaceDropzone } from '@/components/tools/ToolWorkspaceDropzone'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useImageTool } from '@/hooks/useImageTool'
import { formatBytes } from '@/lib/fileValidation'
import { colorizeImage, getResultDisplayUrl } from '@/services/imageApi'

export function ColorizePage() {
  const { t } = useTranslation(['tools', 'common'])
  const [model, setModel] = useState<'artistic' | 'modelscope'>('artistic')
  const {
    file, handleFiles, inputPreviewUrl,
    result, resultPanelOpen, openResultPanel, closeResultPanel,
    pending, progress, error, errorMeta, retry,
    runTool, runState,
  } = useImageTool()

  const runColorize = () => {
    void runTool((f, onProgress) => colorizeImage(f, { model }, onProgress))
  }

  return (
    <>
      <SEOHead title={t('colorize.seoTitle')} description={t('colorize.seoDescription')} keywords={t('colorize.seoKeywords')} canonicalPath="/image-tools/colorize" jsonLd={[buildToolJsonLd({ name: t('colorize.seoTitle'), description: t('colorize.seoDescription'), url: '/image-tools/colorize' }), buildBreadcrumbJsonLd([{ name: t('common:nav.home'), path: '/' }, { name: t('title'), path: '/image-tools' }, { name: t('colorize.title'), path: '/image-tools/colorize' }])]} />
      <ToolPageShell title={t('colorize.title')} description={t('colorize.description')} toolName="image/colorize" backTo="/image-tools">
        <div className="space-y-5">
          <ToolWorkspaceDropzone
            accept={{ 'image/*': [] }}
            multiple={false}
            maxFiles={1}
            onFiles={handleFiles}
            title={t('colorize.dropTitle')}
            hint={t('colorize.dropHint')}
          />
          <ToolErrorBanner error={error} errorMeta={errorMeta} onRetry={file ? () => retry() : undefined} />

          <div className="space-y-2">
            <Label>{t('colorize.styleLabel')}</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={model === 'artistic' ? 'secondary' : 'outline'}
                disabled={pending}
                onClick={() => setModel('artistic')}
              >
                {t('colorize.styleArtistic')}
              </Button>
              <Button
                type="button"
                variant={model === 'modelscope' ? 'secondary' : 'outline'}
                disabled={pending}
                onClick={() => setModel('modelscope')}
              >
                {t('colorize.styleRealistic')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t(`colorize.styleHint_${model}`)}</p>
          </div>

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
        </div>
      </ToolPageShell>

      <ToolActionBar
        mode="manual"
        status={runState.statusText}
        pending={pending}
        progress={progress}
        error={error}
        done={runState.phase === 'done'}
        toolName="image/colorize"
        ctaLabel={t('colorize.startColorize')}
        ctaDisabled={!file || pending}
        onCta={runColorize}
        onViewResult={result ? openResultPanel : undefined}
      />

      <ToolResultPanel open={Boolean(result && resultPanelOpen)} title={t('common:actions.downloadResult')} onClose={closeResultPanel}>
        {result && file ? (
          <ImageResultContent file={file} result={result} inputPreviewUrl={inputPreviewUrl} shareType="colorize" onClose={closeResultPanel} />
        ) : null}
      </ToolResultPanel>
    </>
  )
}
