import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BeforeAfterPreview } from '@/components/tools/BeforeAfterPreview'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { ArtifactPreviewCard } from '@/components/tools/ArtifactPreviewCard'
import { DownloadButton } from '@/components/tools/DownloadButton'
import { ProcessingStatus } from '@/components/tools/ProcessingStatus'
import { SEOHead } from '@/components/common/SEOHead'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { UploadProgress } from '@/components/upload/UploadProgress'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useFileUpload } from '@/hooks/useFileUpload'
import { useObjectUrl } from '@/hooks/useObjectUrl'
import { formatBytes } from '@/lib/fileValidation'
import { precompressImage } from '@/lib/imageCompressor'
import { isIntInRange, parseFiniteNumber } from '@/lib/numberInput'
import { compressImage, type FileResult } from '@/services/imageApi'

export function CompressPage() {
  const { t } = useTranslation('tools')
  const [file, setFile] = useState<File | null>(null)
  const [qualityInput, setQualityInput] = useState('80')
  const [targetKbInput, setTargetKbInput] = useState('')
  const [result, setResult] = useState<FileResult | null>(null)
  const { pending, progress, error, reset, run } = useFileUpload()
  const inputPreviewUrl = useObjectUrl(file)

  const quality = parseFiniteNumber(qualityInput)
  const targetKb = parseFiniteNumber(targetKbInput)
  const qualityValid = quality != null && isIntInRange(quality, 1, 100)
  const targetKbValid = targetKbInput.trim() === '' || (targetKb != null && isIntInRange(targetKb, 1, 1_000_000))
  const formValid = qualityValid && targetKbValid

  return (
    <>
      <SEOHead title={t('compress.seoTitle')} description={t('compress.seoDescription')} keywords={t('compress.seoKeywords')} canonicalPath="/image-tools/compress" />
      <ToolPageShell
        title={t('compress.title')}
        description={t('compress.description')}
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
            onFiles={async (files) => {
              reset()
              setResult(null)
              try {
                // Client-side precompression to reduce upload cost.
                const pre = await precompressImage(files[0], { maxSizeMB: 12, maxWidthOrHeight: 3000 })
                setFile(pre)
              } catch {
                setFile(files[0])
              }
            }}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quality">{t('compress.qualityLabel')}</Label>
              <Input
                id="quality"
                type="number"
                min={1}
                max={100}
                value={qualityInput}
                onChange={(e) => setQualityInput(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="targetKb">{t('compress.targetSizeLabel')}</Label>
              <Input
                id="targetKb"
                type="number"
                min={1}
                placeholder={t('compress.targetSizePlaceholder')}
                value={targetKbInput}
                onChange={(e) => setTargetKbInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('compress.targetSizeHint')}</p>
            </div>
          </div>

          <ProcessingStatus pending={pending} error={error} />
          <UploadProgress value={pending ? progress : null} />

          <Button
            type="button"
            className="w-full"
            disabled={!file || pending || !formValid}
            onClick={async () => {
              if (!file || !formValid || quality == null) return
              setResult(null)
              try {
                const res = await run((onProgress) =>
                  compressImage(
                    file,
                    {
                      quality,
                      targetKb: targetKbInput.trim() === '' ? undefined : (targetKb ?? undefined),
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
            {pending ? t('compress.processing') : t('compress.startCompress')}
          </Button>
        </div>
      </ToolPageShell>
    </>
  )
}
