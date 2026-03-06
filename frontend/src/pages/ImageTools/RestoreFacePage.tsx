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
import { getResultDisplayUrl, restoreFace, type FileResult } from '@/services/imageApi'

export function RestoreFacePage() {
  const { t } = useTranslation(['tools', 'common'])
  const [file, setFile] = useState<File | null>(null)
  const [w, setW] = useState(0.5)
  const [upscale, setUpscale] = useState<1 | 2>(2)
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

  const runRestore = async () => {
    if (!file) return
    setResult(null)
    setResultPanelOpen(false)
    try {
      const res = await run((onProgress) => restoreFace(file, { w, upscale }, onProgress))
      setResult(res)
      setResultPanelOpen(true)
    } catch {
      // Error handled by useFileUpload.
    }
  }

  return (
    <>
      <SEOHead title={t('restoreFace.seoTitle')} description={t('restoreFace.seoDescription')} keywords={t('restoreFace.seoKeywords')} canonicalPath="/image-tools/restore-face" jsonLd={[buildToolJsonLd({ name: t('restoreFace.seoTitle'), description: t('restoreFace.seoDescription'), url: '/image-tools/restore-face' }), buildBreadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: t('title'), path: '/image-tools' }, { name: t('restoreFace.title'), path: '/image-tools/restore-face' }])]} />
      <ToolPageShell title={t('restoreFace.title')} description={t('restoreFace.description')} toolName="image/restore-face" backTo="/image-tools">
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
        onCta={() => { void runRestore() }}
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
              <ShareResultButton originalFile={file} resultFileId={result.file_id} resultSize={result.size} shareType="restore_face" className="w-auto" />
              <GatedDownloadButton result={result} className="w-auto" />
            </div>
          </div>
        ) : null}
      </ToolResultPanel>
    </>
  )
}
