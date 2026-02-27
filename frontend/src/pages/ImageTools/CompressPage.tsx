import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { FileDropzone } from '@/components/upload/FileDropzone'
import { DownloadButton } from '@/components/tools/DownloadButton'
import { ProcessingStatus } from '@/components/tools/ProcessingStatus'
import { SEOHead } from '@/components/common/SEOHead'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { UploadProgress } from '@/components/upload/UploadProgress'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useFileUpload } from '@/hooks/useFileUpload'
import { formatBytes } from '@/lib/fileValidation'
import { precompressImage } from '@/lib/imageCompressor'
import { compressImage, type FileResult } from '@/services/imageApi'

export function CompressPage() {
  const { t } = useTranslation('tools')
  const [file, setFile] = useState<File | null>(null)
  const [quality, setQuality] = useState(80)
  const [targetKb, setTargetKb] = useState<number | ''>('')
  const [result, setResult] = useState<FileResult | null>(null)
  const { pending, progress, error, reset, run } = useFileUpload()

  const fileInfo = useMemo(() => {
    if (!file) return null
    return `${file.name} · ${formatBytes(file.size)}`
  }, [file])

  return (
    <>
      <SEOHead title={t('compress.seoTitle')} description={t('compress.seoDescription')} keywords={t('compress.seoKeywords')} canonicalPath="/image-tools/compress" />
      <ToolPageShell title={t('compress.title')} description={t('compress.description')}>
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

        {fileInfo ? <p className="text-xs text-muted-foreground">{fileInfo}</p> : null}

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="quality">{t('compress.qualityLabel')}</Label>
            <Input
              id="quality"
              type="number"
              min={1}
              max={100}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="targetKb">{t('compress.targetSizeLabel')}</Label>
            <Input
              id="targetKb"
              type="number"
              min={1}
              placeholder={t('compress.targetSizePlaceholder')}
              value={targetKb}
              onChange={(e) => setTargetKb(e.target.value === '' ? '' : Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">{t('compress.targetSizeHint')}</p>
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
                const res = await run((onProgress) =>
                  compressImage(
                    file,
                    {
                      quality,
                      targetKb: targetKb === '' ? undefined : targetKb,
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

          {result ? (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs text-muted-foreground">
                {t('compress.output', { filename: result.filename, size: formatBytes(result.size) })}
              </p>
              <DownloadButton url={result.download_url} />
            </div>
          ) : null}
        </div>
      </div>
    </ToolPageShell>
    </>
  )
}
