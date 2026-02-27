import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ArtifactPreviewCard } from '@/components/tools/ArtifactPreviewCard'
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
import { isIntInRange, parseFiniteNumber } from '@/lib/numberInput'
import { compressPdf, type FileResult } from '@/services/pdfApi'
import { SEOHead } from '@/components/common/SEOHead'

export function PdfCompressPage() {
  const { t } = useTranslation('tools')
  const [file, setFile] = useState<File | null>(null)
  const [targetKbInput, setTargetKbInput] = useState('')
  const [result, setResult] = useState<FileResult | null>(null)
  const { pending, progress, error, reset, run } = useFileUpload()

  const targetKb = parseFiniteNumber(targetKbInput)
  const targetKbValid = targetKbInput.trim() === '' || (targetKb != null && isIntInRange(targetKb, 1, 1_000_000))

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

        {file ? (
          <ArtifactPreviewCard
            label={t('common:preview.input')}
            filename={file.name}
            sizeText={formatBytes(file.size)}
            mediaKind="pdf"
          />
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="targetKb">{t('pdf.compress.targetSizeLabel')}</Label>
          <Input
            id="targetKb"
            type="number"
            min={1}
            placeholder={t('pdf.compress.targetSizePlaceholder')}
            value={targetKbInput}
            onChange={(e) => setTargetKbInput(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t('pdf.compress.targetSizeHint')}</p>
        </div>

        <ProcessingStatus pending={pending} error={error} />
        <UploadProgress value={pending ? progress : null} />

        <div className="space-y-4">
          <Button
            type="button"
            className="w-full"
            disabled={!file || pending || !targetKbValid}
            onClick={async () => {
              if (!file || !targetKbValid) return
              setResult(null)
              try {
                const res = await run((onProgress) =>
                  compressPdf(file, { targetKb: targetKbInput.trim() === '' ? undefined : (targetKb ?? undefined) }, onProgress),
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
