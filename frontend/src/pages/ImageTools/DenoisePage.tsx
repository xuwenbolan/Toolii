import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SEOHead } from '@/components/common/SEOHead'
import { buildBreadcrumbJsonLd, buildToolJsonLd } from '@/lib/jsonLd'
import { BeforeAfterPreview } from '@/components/tools/BeforeAfterPreview'
import { ArtifactPreviewCard } from '@/components/tools/ArtifactPreviewCard'
import { GatedDownloadButton } from '@/components/tools/GatedDownloadButton'
import { ToolActionBar } from '@/components/tools/ToolActionBar'
import { ToolErrorBanner } from '@/components/tools/ToolErrorBanner'
import { ToolResultPanel } from '@/components/tools/ToolResultPanel'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { useFileUpload } from '@/hooks/useFileUpload'
import { useObjectUrl } from '@/hooks/useObjectUrl'
import { useToolRunState } from '@/hooks/useToolRunState'
import { formatBytes } from '@/lib/fileValidation'
import { ShareResultButton } from '@/components/tools/ShareResultButton'
import { denoiseImage, getResultDisplayUrl, type FileResult } from '@/services/imageApi'

export function DenoisePage() {
  const { t } = useTranslation(['tools', 'common'])
  const [file, setFile] = useState<File | null>(null)
  const [strength, setStrength] = useState(0.5)
  const [task, setTask] = useState<'denoise' | 'deblur'>('denoise')
  const [modelWidth, setModelWidth] = useState<32 | 64>(64)
  const [result, setResult] = useState<FileResult | null>(null)
  const [resultPanelOpen, setResultPanelOpen] = useState(false)
  const { pending, progress, error, errorMeta, reset, run, retry } = useFileUpload()
  const inputPreviewUrl = useObjectUrl(file)

  const fileInfo = useMemo(() => {
    if (!file) return null
    return `${file.name} · ${formatBytes(file.size)}`
  }, [file])
  const resultInfo = result ? `${result.filename} · ${formatBytes(result.size)}` : undefined
  const runState = useToolRunState({
    mode: 'manual',
    hasInput: Boolean(file),
    hasResult: Boolean(result),
    pending,
    error,
    texts: { input: fileInfo ?? undefined, result: resultInfo },
  })

  const runDenoise = async () => {
    if (!file) return
    setResult(null)
    setResultPanelOpen(false)
    try {
      const res = await run((onProgress) => denoiseImage(file, { strength, task, model_width: modelWidth }, onProgress))
      setResult(res)
      setResultPanelOpen(true)
    } catch {
      // Error handled by useFileUpload.
    }
  }

  return (
    <>
      <SEOHead title={t('denoise.seoTitle')} description={t('denoise.seoDescription')} keywords={t('denoise.seoKeywords')} canonicalPath="/image-tools/denoise" jsonLd={[buildToolJsonLd({ name: t('denoise.seoTitle'), description: t('denoise.seoDescription'), url: '/image-tools/denoise' }), buildBreadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: t('title'), path: '/image-tools' }, { name: t('denoise.title'), path: '/image-tools/denoise' }])]} />
      <ToolPageShell title={t('denoise.title')} description={t('denoise.description')} toolName="image/denoise" backTo="/image-tools">
        <div className="space-y-5">
          <FileDropzone
            accept="image/*"
            onFiles={(files) => {
              reset()
              setResult(null)
              setResultPanelOpen(false)
              setFile(files[0])
            }}
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
        onCta={() => { void runDenoise() }}
        onViewResult={result ? () => setResultPanelOpen(true) : undefined}
      />

      <ToolResultPanel open={Boolean(result && resultPanelOpen)} title={t('common:actions.downloadResult')} onClose={() => setResultPanelOpen(false)}>
        {result && file ? (
          <div className="space-y-4">
            <BeforeAfterPreview
              beforeFilename={file.name}
              beforeSizeText={formatBytes(file.size)}
              beforeUrl={inputPreviewUrl}
              afterFilename={result.filename}
              afterSizeText={formatBytes(result.size)}
              afterUrl={getResultDisplayUrl(result)}
              protectedPreview={result?.requires_credit}
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setResultPanelOpen(false)}>
                {t('common:actions.back')}
              </Button>
              <ShareResultButton originalFile={file} resultFileId={result.file_id} resultSize={result.size} shareType="denoise" className="w-auto" />
              <GatedDownloadButton result={result} className="w-auto" />
            </div>
          </div>
        ) : null}
      </ToolResultPanel>
    </>
  )
}
