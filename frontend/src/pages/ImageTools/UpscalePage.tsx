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
import { useFileUpload } from '@/hooks/useFileUpload'
import { useObjectUrl } from '@/hooks/useObjectUrl'
import { useToolRunState } from '@/hooks/useToolRunState'
import { formatBytes } from '@/lib/fileValidation'
import { ShareResultButton } from '@/components/tools/ShareResultButton'
import { upscaleImage, type FileResult } from '@/services/imageApi'

type Scale = 2 | 4

export function UpscalePage() {
  const { t } = useTranslation(['tools', 'common'])
  const [file, setFile] = useState<File | null>(null)
  const [scale, setScale] = useState<Scale>(4)
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
    mode: 'auto',
    hasInput: Boolean(file),
    hasResult: Boolean(result),
    pending,
    error,
    texts: { input: fileInfo ?? undefined, result: resultInfo },
  })

  const runUpscale = async (input: File, nextScale: Scale = scale) => {
    setResult(null)
    setResultPanelOpen(false)
    try {
      const res = await run((onProgress) => upscaleImage(input, { scale: nextScale }, onProgress))
      setResult(res)
      setResultPanelOpen(true)
    } catch {
      // Error handled by useFileUpload.
    }
  }

  return (
    <>
      <SEOHead title={t('upscale.seoTitle')} description={t('upscale.seoDescription')} keywords={t('upscale.seoKeywords')} canonicalPath="/image-tools/upscale" jsonLd={[buildToolJsonLd({ name: t('upscale.seoTitle'), description: t('upscale.seoDescription'), url: '/image-tools/upscale' }), buildBreadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: t('title'), path: '/image-tools' }, { name: t('upscale.title'), path: '/image-tools/upscale' }])]} />
      <ToolPageShell title={t('upscale.title')} description={t('upscale.description')} toolName="image/upscale" backTo="/image-tools">
        <div className="space-y-5">
          <FileDropzone
            accept="image/*"
            onFiles={(files) => {
              reset()
              setResult(null)
              setResultPanelOpen(false)
              const nextFile = files[0]
              setFile(nextFile)
              void runUpscale(nextFile)
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

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('upscale.scaleLabel')}</label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={scale === 2 ? 'secondary' : 'outline'}
                disabled={pending}
                onClick={() => {
                  setScale(2)
                  if (file && scale !== 2 && !pending) void runUpscale(file, 2)
                }}
              >
                2x
              </Button>
              <Button
                type="button"
                variant={scale === 4 ? 'secondary' : 'outline'}
                disabled={pending}
                onClick={() => {
                  setScale(4)
                  if (file && scale !== 4 && !pending) void runUpscale(file, 4)
                }}
              >
                4x
              </Button>
            </div>
          </div>
        </div>
      </ToolPageShell>

      <ToolActionBar mode="auto" status={runState.statusText} pending={pending} progress={progress} error={error} done={runState.phase === 'done'} />

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
              <ShareResultButton originalFile={file} resultFileId={result.file_id} shareType="upscale" className="w-auto" />
              <DownloadButton url={result.download_url} className="w-auto" />
            </div>
          </div>
        ) : null}
      </ToolResultPanel>
    </>
  )
}
