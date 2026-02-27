import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ArtifactPreviewCard } from '@/components/tools/ArtifactPreviewCard'
import { DownloadButton } from '@/components/tools/DownloadButton'
import { ProcessingStatus } from '@/components/tools/ProcessingStatus'
import { SortableFileList } from '@/components/tools/SortableFileList'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { UploadProgress } from '@/components/upload/UploadProgress'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useFileUpload } from '@/hooks/useFileUpload'
import { formatBytes } from '@/lib/fileValidation'
import { isIntInRange, parseFiniteNumber } from '@/lib/numberInput'
import { imagesToPdf, type FileResult } from '@/services/pdfApi'
import { SEOHead } from '@/components/common/SEOHead'

export function ImagesToPdfPage() {
  const { t } = useTranslation('tools')
  const [files, setFiles] = useState<File[]>([])
  const [dpiInput, setDpiInput] = useState('150')
  const [result, setResult] = useState<FileResult | null>(null)
  const { pending, progress, error, reset, run } = useFileUpload()

  const fileInfo = useMemo(() => {
    if (files.length === 0) return null
    const total = files.reduce((acc, file) => acc + file.size, 0)
    return t('pdf.imagesToPdf.fileInfo', { count: files.length, size: formatBytes(total) })
  }, [files, t])
  const dpi = parseFiniteNumber(dpiInput)
  const dpiValid = dpi != null && isIntInRange(dpi, 72, 600)

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

        <SortableFileList
          files={files}
          kind="image"
          hint={t('pdf.imagesToPdf.orderHint')}
          onReorder={setFiles}
          onRemove={(index) => {
            setFiles((prev) => prev.filter((_, i) => i !== index))
          }}
        />

        <div className="space-y-2">
          <Label htmlFor="dpi">DPI（72-600）</Label>
          <Input
            id="dpi"
            type="number"
            min={72}
            max={600}
            value={dpiInput}
            onChange={(e) => setDpiInput(e.target.value)}
          />
        </div>

        <ProcessingStatus pending={pending} error={error} />
        <UploadProgress value={pending ? progress : null} />

        <div className="space-y-4">
          <Button
            type="button"
            className="w-full"
            disabled={files.length === 0 || pending || !dpiValid}
            onClick={async () => {
              if (files.length === 0 || !dpiValid || dpi == null) return
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
            <ArtifactPreviewCard
              label={t('common:preview.output')}
              filename={result.filename}
              sizeText={formatBytes(result.size)}
              mediaKind="pdf"
              action={<DownloadButton url={result.download_url} className="w-auto" />}
            />
          ) : null}
        </div>
      </div>
    </ToolPageShell>
    </>
  )
}
