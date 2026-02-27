import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

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
import { formatBytes } from '@/lib/fileValidation'
import { convertImage, type FileResult } from '@/services/imageApi'

type Format = 'jpeg' | 'png' | 'webp'

export function ConvertPage() {
  const { t } = useTranslation('tools')
  const [file, setFile] = useState<File | null>(null)
  const [format, setFormat] = useState<Format>('jpeg')
  const [quality, setQuality] = useState(92)
  const [result, setResult] = useState<FileResult | null>(null)
  const { pending, progress, error, reset, run } = useFileUpload()

  const fileInfo = useMemo(() => {
    if (!file) return null
    return `${file.name} · ${formatBytes(file.size)}`
  }, [file])

  return (
    <>
      <SEOHead title={t('convert.seoTitle')} description={t('convert.seoDescription')} keywords={t('convert.seoKeywords')} canonicalPath="/image-tools/convert" />
      <ToolPageShell title={t('convert.title')} description={t('convert.description')}>
      <div className="space-y-5">
        <FileDropzone
          accept="image/*"
          onFiles={(files) => {
            reset()
            setResult(null)
            setFile(files[0])
          }}
        />

        {fileInfo ? <p className="text-xs text-muted-foreground">{fileInfo}</p> : null}

        <div className="grid gap-4">
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
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
            />
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
                  convertImage(
                    file,
                    {
                      outputFormat: format,
                      quality: format === 'png' ? undefined : quality,
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

          {result ? (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs text-muted-foreground">
                {t('convert.output', { filename: result.filename, size: formatBytes(result.size) })}
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
