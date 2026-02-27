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
import { compressPdf, type FileResult } from '@/services/pdfApi'
import { SEOHead } from '@/components/common/SEOHead'

export function PdfCompressPage() {
  const { t } = useTranslation('tools')
  const [file, setFile] = useState<File | null>(null)
  const [targetKb, setTargetKb] = useState<number | ''>('')
  const [result, setResult] = useState<FileResult | null>(null)
  const { pending, progress, error, reset, run } = useFileUpload()

  const fileInfo = useMemo(() => {
    if (!file) return null
    return `${file.name} · ${formatBytes(file.size)}`
  }, [file])

  return (
    <>
      <SEOHead title={t('pdf.compress.seoTitle')} description={t('pdf.compress.seoDescription')} keywords={t('pdf.compress.seoKeywords')} canonicalPath="/pdf-tools/compress" />
      <ToolPageShell title={t('pdf.compress.title')} description={t('pdf.compress.description')} backTo="/pdf-tools">
        <div className="space-y-5">
          <FileDropzone
          accept="application/pdf"
          showCamera={false}
          onFiles={(files) => {
            reset()
            setResult(null)
            setFile(files[0])
          }}
        />

        {fileInfo ? <p className="text-xs text-muted-foreground">{fileInfo}</p> : null}

        <div className="space-y-2">
          <Label htmlFor="targetKb">{t('pdf.compress.targetSizeLabel')}</Label>
          <Input
            id="targetKb"
            type="number"
            min={1}
            placeholder={t('pdf.compress.targetSizePlaceholder')}
            value={targetKb}
            onChange={(e) => setTargetKb(e.target.value === '' ? '' : Number(e.target.value))}
          />
          <p className="text-xs text-muted-foreground">{t('pdf.compress.targetSizeHint')}</p>
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
                  compressPdf(file, { targetKb: targetKb === '' ? undefined : targetKb }, onProgress),
                )
                setResult(res)
              } catch {
                // Error message is handled by useFileUpload.
              }
            }}
          >
            {pending ? t('pdf.compress.processing') : t('pdf.compress.startCompress')}
          </Button>

          {result ? (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs text-muted-foreground">
                {t('pdf.compress.output', { filename: result.filename, size: formatBytes(result.size) })}
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
