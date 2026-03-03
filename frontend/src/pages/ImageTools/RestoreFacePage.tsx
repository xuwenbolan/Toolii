import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SEOHead } from '@/components/common/SEOHead'
import { buildBreadcrumbJsonLd, buildToolJsonLd } from '@/lib/jsonLd'
import { BeforeAfterPreview } from '@/components/tools/BeforeAfterPreview'
import { ArtifactPreviewCard } from '@/components/tools/ArtifactPreviewCard'
import { DownloadButton } from '@/components/tools/DownloadButton'
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
import { ShareTransferButton } from '@/components/tools/ShareTransferButton'
import { restoreFace, type FileResult } from '@/services/imageApi'

export function RestoreFacePage() {
  const { t } = useTranslation(['tools', 'common'])
  const [file, setFile] = useState<File | null>(null)
  const [w, setW] = useState(0.5)
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
      const res = await run((onProgress) => restoreFace(file, { w }, onProgress))
      setResult(res)
      setResultPanelOpen(true)
    } catch {
      // Error handled by useFileUpload.
    }
  }

  return (
    <>
      <SEOHead title={t('restoreFace.seoTitle')} description={t('restoreFace.seoDescription')} keywords={t('restoreFace.seoKeywords')} canonicalPath="/image-tools/restore-face" jsonLd={[buildToolJsonLd({ name: t('restoreFace.seoTitle'), description: t('restoreFace.seoDescription'), url: '/image-tools/restore-face' }), buildBreadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: t('title'), path: '/image-tools' }, { name: t('restoreFace.title'), path: '/image-tools/restore-face' }])]} />
      <ToolPageShell title={t('restoreFace.title')} description={t('restoreFace.description')} backTo="/image-tools">
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
              mediaUrl={result ? result.download_url : inputPreviewUrl}
              action={result ? <DownloadButton url={result.download_url} size="sm" className="w-auto" /> : undefined}
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
        </div>
      </ToolPageShell>

      <ToolActionBar
        mode="manual"
        status={runState.statusText}
        pending={pending}
        progress={progress}
        error={error}
        done={runState.phase === 'done'}
        ctaLabel={t('restoreFace.startRestore')}
        ctaDisabled={!file || pending}
        onCta={() => { void runRestore() }}
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
              afterUrl={result.download_url}
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setResultPanelOpen(false)}>
                {t('common:actions.back')}
              </Button>
              <ShareTransferButton fileId={result.file_id} className="w-auto" />
              <DownloadButton url={result.download_url} className="w-auto" />
            </div>
          </div>
        ) : null}
      </ToolResultPanel>
    </>
  )
}
