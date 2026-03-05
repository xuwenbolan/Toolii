import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BeforeAfterPreview } from '@/components/tools/BeforeAfterPreview'
import { ArtifactPreviewCard } from '@/components/tools/ArtifactPreviewCard'
import { GatedDownloadButton } from '@/components/tools/GatedDownloadButton'
import { ToolActionBar } from '@/components/tools/ToolActionBar'
import { ToolErrorBanner } from '@/components/tools/ToolErrorBanner'
import { ToolResultPanel } from '@/components/tools/ToolResultPanel'
import { SEOHead } from '@/components/common/SEOHead'
import { buildBreadcrumbJsonLd, buildToolJsonLd } from '@/lib/jsonLd'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { Button } from '@/components/ui/button'
import { useFileUpload } from '@/hooks/useFileUpload'
import { useObjectUrl } from '@/hooks/useObjectUrl'
import { useToolRunState } from '@/hooks/useToolRunState'
import { formatBytes } from '@/lib/fileValidation'
import { ShareResultButton } from '@/components/tools/ShareResultButton'
import { enhanceScan, getResultDisplayUrl, type FileResult } from '@/services/imageApi'

type Mode = 'bw' | 'color'

export function ScanEnhancePage() {
  const { t } = useTranslation(['tools', 'common'])
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<Mode>('bw')
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
    texts: {
      input: fileInfo ?? undefined,
      result: resultInfo,
    },
  })

  const runEnhance = async () => {
    if (!file) return
    setResult(null)
    setResultPanelOpen(false)

    try {
      const res = await run((onProgress) => enhanceScan(file, { mode }, onProgress))
      setResult(res)
      setResultPanelOpen(true)
    } catch {
      // Error message is handled by useFileUpload.
    }
  }

  return (
    <>
      <SEOHead title={t('scanEnhance.seoTitle')} description={t('scanEnhance.seoDescription')} keywords={t('scanEnhance.seoKeywords')} canonicalPath="/image-tools/scan-enhance" jsonLd={[buildToolJsonLd({ name: t('scanEnhance.seoTitle'), description: t('scanEnhance.seoDescription'), url: '/image-tools/scan-enhance' }), buildBreadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: t('title'), path: '/image-tools' }, { name: t('scanEnhance.title'), path: '/image-tools/scan-enhance' }])]} />
      <ToolPageShell title={t('scanEnhance.title')} description={t('scanEnhance.description')} toolName="image/scan-enhance" backTo="/image-tools">
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
        <ToolErrorBanner
          error={error}
          errorMeta={errorMeta}
          onRetry={file ? () => retry() : undefined}
        />

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
          <label className="text-sm font-medium">{t('scanEnhance.outputMode')}</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant={mode === 'bw' ? 'secondary' : 'outline'}
              disabled={pending}
              onClick={() => setMode('bw')}
            >
              {t('scanEnhance.bw')}
            </Button>
            <Button
              type="button"
              variant={mode === 'color' ? 'secondary' : 'outline'}
              disabled={pending}
              onClick={() => setMode('color')}
            >
              {t('scanEnhance.color')}
            </Button>
          </div>
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
      toolName="image/scan-enhance"
      ctaLabel={t('scanEnhance.startProcess')}
      ctaDisabled={!file || pending}
      onCta={() => { void runEnhance() }}
      onViewResult={result ? () => setResultPanelOpen(true) : undefined}
    />

    <ToolResultPanel
      open={Boolean(result && resultPanelOpen)}
      title={t('common:actions.downloadResult')}
      onClose={() => setResultPanelOpen(false)}
    >
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
            <ShareResultButton originalFile={file} resultFileId={result.file_id} resultSize={result.size} shareType="scan_enhance" className="w-auto" />
            <GatedDownloadButton result={result} className="w-auto" />
          </div>
        </div>
      ) : null}
    </ToolResultPanel>
    </>
  )
}
