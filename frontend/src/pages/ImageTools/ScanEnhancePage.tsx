import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BeforeAfterPreview } from '@/components/tools/BeforeAfterPreview'
import { ArtifactPreviewCard } from '@/components/tools/ArtifactPreviewCard'
import { DownloadButton } from '@/components/tools/DownloadButton'
import { ProcessingStatus } from '@/components/tools/ProcessingStatus'
import { SEOHead } from '@/components/common/SEOHead'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { UploadProgress } from '@/components/upload/UploadProgress'
import { Button } from '@/components/ui/button'
import { useFileUpload } from '@/hooks/useFileUpload'
import { useObjectUrl } from '@/hooks/useObjectUrl'
import { formatBytes } from '@/lib/fileValidation'
import { enhanceScan, type FileResult } from '@/services/imageApi'

type Mode = 'bw' | 'color'

export function ScanEnhancePage() {
  const { t } = useTranslation('tools')
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<Mode>('bw')
  const [result, setResult] = useState<FileResult | null>(null)
  const { pending, progress, error, reset, run } = useFileUpload()
  const inputPreviewUrl = useObjectUrl(file)

  const fileInfo = useMemo(() => {
    if (!file) return null
    return `${file.name} · ${formatBytes(file.size)}`
  }, [file])

  return (
    <>
      <SEOHead title={t('scanEnhance.seoTitle')} description={t('scanEnhance.seoDescription')} keywords={t('scanEnhance.seoKeywords')} canonicalPath="/image-tools/scan-enhance" />
      <ToolPageShell title={t('scanEnhance.title')} description={t('scanEnhance.description')}>
      <div className="space-y-5">
        <FileDropzone
          accept="image/*"
          onFiles={(files) => {
            reset()
            setResult(null)
            setFile(files[0])
          }}
        />

        {file ? (
          <ArtifactPreviewCard
            label={t('common:preview.input')}
            filename={file.name}
            sizeText={formatBytes(file.size)}
            mediaKind="image"
            mediaUrl={inputPreviewUrl}
          />
        ) : null}

        <div className="space-y-2">
          <label className="text-sm font-medium">{t('scanEnhance.outputMode')}</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant={mode === 'bw' ? 'secondary' : 'outline'}
              onClick={() => setMode('bw')}
            >
              {t('scanEnhance.bw')}
            </Button>
            <Button
              type="button"
              variant={mode === 'color' ? 'secondary' : 'outline'}
              onClick={() => setMode('color')}
            >
              {t('scanEnhance.color')}
            </Button>
          </div>
        </div>

        <ProcessingStatus pending={pending} error={error} />
        <UploadProgress value={pending ? progress : null} />

        <div className="space-y-4">
          <Button
            type="button"
            className="w-full"
            disabled={!file || pending}
            onClick={async () => {
              if (!file) return
              setResult(null)
              try {
                const res = await run((onProgress) => enhanceScan(file, { mode }, onProgress))
                setResult(res)
              } catch {
                // Error message is handled by useFileUpload.
              }
            }}
          >
            {pending ? t('scanEnhance.processing') : t('scanEnhance.startProcess')}
          </Button>

          {result ? (
            <div className="space-y-3">
              {fileInfo ? (
                <BeforeAfterPreview
                  beforeFilename={file?.name ?? '-'}
                  beforeSizeText={file ? formatBytes(file.size) : undefined}
                  beforeUrl={inputPreviewUrl}
                  afterFilename={result.filename}
                  afterSizeText={formatBytes(result.size)}
                  afterUrl={result.download_url}
                />
              ) : null}
              <ArtifactPreviewCard
                label={t('common:preview.output')}
                filename={result.filename}
                sizeText={formatBytes(result.size)}
                mediaKind="image"
                mediaUrl={result.download_url}
                action={<DownloadButton url={result.download_url} className="w-auto" />}
              />
            </div>
          ) : null}
        </div>
      </div>
    </ToolPageShell>
    </>
  )
}
