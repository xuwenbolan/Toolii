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
import { splitPdf, type FileResult } from '@/services/pdfApi'
import { SEOHead } from '@/components/common/SEOHead'

export function PdfSplitPage() {
  const { t } = useTranslation('tools')
  const [file, setFile] = useState<File | null>(null)
  const [ranges, setRanges] = useState('')
  const [result, setResult] = useState<FileResult | null>(null)
  const { pending, progress, error, reset, run } = useFileUpload()

  return (
    <>
      <SEOHead title={t('pdf.split.seoTitle')} description={t('pdf.split.seoDescription')} keywords={t('pdf.split.seoKeywords')} canonicalPath="/pdf-tools/split" />
      <ToolPageShell title={t('pdf.split.title')} description={t('pdf.split.description')} backTo="/pdf-tools">
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
            <Label htmlFor="ranges">{t('pdf.split.rangesLabel')}</Label>
            <Input
              id="ranges"
              type="text"
              placeholder={t('pdf.split.rangesPlaceholder')}
              value={ranges}
              onChange={(e) => setRanges(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('pdf.split.rangesHint')}</p>
          </div>

          <ProcessingStatus pending={pending} error={error} />
          <UploadProgress value={pending ? progress : null} />

          <div className="space-y-4">
            <Button
              type="button"
              className="w-full"
              disabled={!file || !ranges.trim() || pending}
              onClick={async () => {
                if (!file || !ranges.trim()) return
                setResult(null)
                try {
                  const res = await run((onProgress) =>
                    splitPdf(file, { ranges: ranges.trim() }, onProgress),
                  )
                  setResult(res)
                } catch {
                  // Error handled by useFileUpload.
                }
              }}
            >
              {pending ? t('pdf.split.processing') : t('pdf.split.startSplit')}
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
