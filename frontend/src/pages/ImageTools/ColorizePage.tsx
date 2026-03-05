import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SEOHead } from '@/components/common/SEOHead'
import { buildBreadcrumbJsonLd, buildToolJsonLd } from '@/lib/jsonLd'
import { BeforeAfterPreview } from '@/components/tools/BeforeAfterPreview'
import { GatedDownloadButton } from '@/components/tools/GatedDownloadButton'
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
import { ShareResultButton } from '@/components/tools/ShareResultButton'
import { ArtifactPreviewCard } from '@/components/tools/ArtifactPreviewCard'
import { colorizeImage, getResultDisplayUrl, type FileResult } from '@/services/imageApi'

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
    mode: 'manual',
    hasInput: Boolean(file),
    hasResult: Boolean(result),
    pending,
    error,
    texts: { input: fileInfo ?? undefined, result: resultInfo },
  })

  const runColorize = async () => {
    if (!file) return
    setResult(null)
    setResultPanelOpen(false)
    try {
      const res = await run((onProgress) => colorizeImage(file, onProgress))
      setResult(res)
      setResultPanelOpen(true)
    } catch {
      // Error handled by useFileUpload.
    }
  }

  return (
    <>
      <SEOHead title={t('colorize.seoTitle')} description={t('colorize.seoDescription')} keywords={t('colorize.seoKeywords')} canonicalPath="/image-tools/colorize" jsonLd={[buildToolJsonLd({ name: t('colorize.seoTitle'), description: t('colorize.seoDescription'), url: '/image-tools/colorize' }), buildBreadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: t('title'), path: '/image-tools' }, { name: t('colorize.title'), path: '/image-tools/colorize' }])]} />
      <ToolPageShell title={t('colorize.title')} description={t('colorize.description')} toolName="image/colorize" backTo="/image-tools">
        <div className="space-y-5">
          <ToolWorkspaceDropzone
            accept={{ 'image/*': [] }}
            multiple={false}
            maxFiles={1}
            onFiles={(files) => {
              reset()
              setResult(null)
              setResultPanelOpen(false)
              setFile(files[0])
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
        onCta={() => { void runColorize() }}
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
              <ShareResultButton originalFile={file} resultFileId={result.file_id} resultSize={result.size} shareType="colorize" className="w-auto" />
              <GatedDownloadButton result={result} className="w-auto" />
            </div>
          </div>
        ) : null}
      </ToolResultPanel>
    </>
  )
}
