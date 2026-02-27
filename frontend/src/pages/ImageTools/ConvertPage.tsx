import { useState } from 'react'
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
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useFileUpload } from '@/hooks/useFileUpload'
import { useObjectUrl } from '@/hooks/useObjectUrl'
import { formatBytes } from '@/lib/fileValidation'
import { isIntInRange, parseFiniteNumber } from '@/lib/numberInput'
import { convertImage, type FileResult } from '@/services/imageApi'

type Format = 'jpeg' | 'png' | 'webp'

export function ConvertPage() {
  const { t } = useTranslation('tools')
  const [file, setFile] = useState<File | null>(null)
  const [format, setFormat] = useState<Format>('jpeg')
  const [qualityInput, setQualityInput] = useState('92')
  const [result, setResult] = useState<FileResult | null>(null)
  const { pending, progress, error, reset, run } = useFileUpload()
  const inputPreviewUrl = useObjectUrl(file)

  const quality = parseFiniteNumber(qualityInput)
  const qualityValid = format === 'png' || (quality != null && isIntInRange(quality, 1, 100))

  return (
    <>
      <SEOHead title={t('convert.seoTitle')} description={t('convert.seoDescription')} keywords={t('convert.seoKeywords')} canonicalPath="/image-tools/convert" />
      <ToolPageShell
        title={t('convert.title')}
        description={t('convert.description')}
        layout="split"
        width="wide"
        sidebar={
          <div className="space-y-4">
            {file ? (
              <ArtifactPreviewCard
                label={t('common:preview.input')}
                filename={file.name}
                sizeText={formatBytes(file.size)}
                mediaKind="image"
                mediaUrl={inputPreviewUrl}
              />
            ) : null}
            {result && file ? (
              <>
                <BeforeAfterPreview
                  beforeFilename={file.name}
                  beforeSizeText={formatBytes(file.size)}
                  beforeUrl={inputPreviewUrl}
                  afterFilename={result.filename}
                  afterSizeText={formatBytes(result.size)}
                  afterUrl={result.download_url}
                />
                <ArtifactPreviewCard
                  label={t('common:preview.output')}
                  filename={result.filename}
                  sizeText={formatBytes(result.size)}
                  mediaKind="image"
                  mediaUrl={result.download_url}
                  action={<DownloadButton url={result.download_url} className="w-auto" />}
                />
              </>
            ) : null}
          </div>
        }
      >
        <div className="space-y-5">
          <FileDropzone
            accept="image/*"
            onFiles={(files) => {
              reset()
              setResult(null)
              setFile(files[0])
            }}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="format">{t('convert.outputFormat')}</Label>
              <select
                id="format"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={format}
                onChange={(e) => setFormat(e.target.value as Format)}
              >
                <option value="jpeg">JPG</option>
                <option value="png">PNG</option>
                <option value="webp">WEBP</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="quality">{t('convert.qualityLabel')}</Label>
              <Input
                id="quality"
                type="number"
                min={1}
                max={100}
                value={qualityInput}
                onChange={(e) => setQualityInput(e.target.value)}
              />
            </div>
          </div>

          <ProcessingStatus pending={pending} error={error} />
          <UploadProgress value={pending ? progress : null} />

          <Button
            type="button"
            className="w-full"
            disabled={!file || pending || !qualityValid}
            onClick={async () => {
              if (!file || !qualityValid) return
              setResult(null)
              try {
                const res = await run((onProgress) =>
                  convertImage(
                    file,
                    {
                      outputFormat: format,
                      quality: format === 'png' ? undefined : (quality ?? undefined),
                    },
                    onProgress,
                  ),
                )
                setResult(res)
              } catch {
                // Error message is handled by useFileUpload.
              }
            }}
          >
            {pending ? t('convert.processing') : t('convert.startConvert')}
          </Button>
        </div>
      </ToolPageShell>
    </>
  )
}
