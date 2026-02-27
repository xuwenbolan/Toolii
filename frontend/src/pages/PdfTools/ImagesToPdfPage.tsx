import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DownloadButton } from '@/components/tools/DownloadButton'
import { ProcessingStatus } from '@/components/tools/ProcessingStatus'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { UploadProgress } from '@/components/upload/UploadProgress'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useFileUpload } from '@/hooks/useFileUpload'
import { formatBytes } from '@/lib/fileValidation'
import { imagesToPdf, type FileResult } from '@/services/pdfApi'
import { SEOHead } from '@/components/common/SEOHead'

export function ImagesToPdfPage() {
  const { t } = useTranslation('tools')
  const [files, setFiles] = useState<File[]>([])
  const [dpi, setDpi] = useState(150)
  const [result, setResult] = useState<FileResult | null>(null)
  const { pending, progress, error, reset, run } = useFileUpload()

  const fileInfo = useMemo(() => {
    if (files.length === 0) return null
    const total = files.reduce((acc, file) => acc + file.size, 0)
    return t('pdf.imagesToPdf.fileInfo', { count: files.length, size: formatBytes(total) })
  }, [files, t])

  return (
    <>
      <SEOHead title={t('pdf.imagesToPdf.seoTitle')} description={t('pdf.imagesToPdf.seoDescription')} keywords={t('pdf.imagesToPdf.seoKeywords')} canonicalPath="/pdf-tools/from-images" />
      <ToolPageShell title={t('pdf.imagesToPdf.title')} description={t('pdf.imagesToPdf.description')} backTo="/pdf-tools">
        <div className="space-y-5">
          <FileDropzone
          accept="image/*"
          multiple
          maxFiles={20}
          onFiles={(picked) => {
            reset()
            setResult(null)
            setFiles(picked)
          }}
        />

        {fileInfo ? <p className="text-xs text-muted-foreground">{fileInfo}</p> : null}

        {files.length > 0 ? (
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-xs text-muted-foreground">{t('pdf.imagesToPdf.orderHint')}</p>
            <div className="space-y-1">
              {files.map((file, index) => (
                <p key={`${file.name}-${index}`} className="truncate text-sm">
                  {index + 1}. {file.name}
                </p>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="dpi">DPI（72-600）</Label>
          <Input
            id="dpi"
            type="number"
            min={72}
            max={600}
            value={dpi}
            onChange={(e) => setDpi(Number(e.target.value))}
          />
        </div>

        <ProcessingStatus pending={pending} error={error} />
        <UploadProgress value={pending ? progress : null} />

        <div className="space-y-4">
          <Button
            type="button"
            className="w-full"
            disabled={files.length === 0 || pending}
            onClick={async () => {
              if (files.length === 0) return
              setResult(null)
              try {
                const res = await run((onProgress) => imagesToPdf(files, { dpi }, onProgress))
                setResult(res)
              } catch {
                // Error message is handled by useFileUpload.
              }
            }}
          >
            {pending ? t('pdf.imagesToPdf.processing') : t('pdf.imagesToPdf.startConvert')}
          </Button>

          {result ? (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs text-muted-foreground">
                {t('pdf.imagesToPdf.output', { filename: result.filename, size: formatBytes(result.size) })}
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
