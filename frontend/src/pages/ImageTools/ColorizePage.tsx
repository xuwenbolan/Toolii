import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SEOHead } from '@/components/common/SEOHead'
import { buildBreadcrumbJsonLd, buildToolJsonLd } from '@/lib/jsonLd'
import { BeforeAfterPreview } from '@/components/tools/BeforeAfterPreview'
import { DownloadButton } from '@/components/tools/DownloadButton'
import { ToolActionBar } from '@/components/tools/ToolActionBar'
import { ToolErrorBanner } from '@/components/tools/ToolErrorBanner'
import { ToolResultPanel } from '@/components/tools/ToolResultPanel'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { ToolWorkspaceDropzone } from '@/components/tools/ToolWorkspaceDropzone'
import { Button } from '@/components/ui/button'
import { useFileUpload } from '@/hooks/useFileUpload'
import { useObjectUrl } from '@/hooks/useObjectUrl'
import { useToolRunState } from '@/hooks/useToolRunState'
import { formatBytes } from '@/lib/fileValidation'
import { ShareTransferButton } from '@/components/tools/ShareTransferButton'
import { ArtifactPreviewCard } from '@/components/tools/ArtifactPreviewCard'
import { colorizeImage, type FileResult } from '@/services/imageApi'

export function ColorizePage() {
  const { t } = useTranslation(['tools', 'common'])
  const [file, setFile] = useState<File | null>(null)
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

  const runColorize = async (input: File) => {
    setResult(null)
    setResultPanelOpen(false)
    try {
      const res = await run((onProgress) => colorizeImage(input, onProgress))
      setResult(res)
      setResultPanelOpen(true)
    } catch {
      // Error handled by useFileUpload.
    }
  }

  return (
    <>
      <SEOHead title={t('colorize.seoTitle')} description={t('colorize.seoDescription')} keywords={t('colorize.seoKeywords')} canonicalPath="/image-tools/colorize" jsonLd={[buildToolJsonLd({ name: t('colorize.seoTitle'), description: t('colorize.seoDescription'), url: '/image-tools/colorize' }), buildBreadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: t('title'), path: '/image-tools' }, { name: t('colorize.title'), path: '/image-tools/colorize' }])]} />
      <ToolPageShell title={t('colorize.title')} description={t('colorize.description')} backTo="/image-tools">
        <div className="space-y-5 tool-section-stagger">
          <ToolWorkspaceDropzone
            accept={{ 'image/*': [] }}
            multiple={false}
            maxFiles={1}
            onFiles={(files) => {
              reset()
              setResult(null)
              setResultPanelOpen(false)
              const nextFile = files[0]
              setFile(nextFile)
              void runColorize(nextFile)
            }}
            title={t('colorize.dropTitle')}
            hint={t('colorize.dropHint')}
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
              <ShareTransferButton fileId={result.file_id} className="w-auto" />
              <DownloadButton url={result.download_url} className="w-auto" />
            </div>
          </div>
        ) : null}
      </ToolResultPanel>
    </>
  )
}
