import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PdfMergeList } from '@/components/pdf/PdfMergeList'
import { DownloadButton } from '@/components/tools/DownloadButton'
import { ProcessingStatus } from '@/components/tools/ProcessingStatus'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { UploadProgress } from '@/components/upload/UploadProgress'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { Button } from '@/components/ui/button'
import { useFileUpload } from '@/hooks/useFileUpload'
import { formatBytes } from '@/lib/fileValidation'
import { mergePdfs, type FileResult } from '@/services/pdfApi'
import { SEOHead } from '@/components/common/SEOHead'

function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= items.length) return items
  const next = items.slice()
  const [item] = next.splice(index, 1)
  next.splice(nextIndex, 0, item)
  return next
}

export function PdfMergePage() {
  const { t } = useTranslation('tools')
  const [files, setFiles] = useState<File[]>([])
  const [result, setResult] = useState<FileResult | null>(null)
  const { pending, progress, error, reset, run } = useFileUpload()

  const fileInfo = useMemo(() => {
    if (files.length === 0) return null
    const total = files.reduce((acc, file) => acc + file.size, 0)
    return t('pdf.merge.fileInfo', { count: files.length, size: formatBytes(total) })
  }, [files, t])

  return (
    <>
      <SEOHead title={t('pdf.merge.seoTitle')} description={t('pdf.merge.seoDescription')} keywords={t('pdf.merge.seoKeywords')} canonicalPath="/pdf-tools/merge" />
      <ToolPageShell title={t('pdf.merge.title')} description={t('pdf.merge.description')} backTo="/pdf-tools">
        <div className="space-y-5">
          <FileDropzone
          accept="application/pdf"
          multiple
          maxFiles={20}
          showCamera={false}
          onFiles={(picked) => {
            reset()
            setResult(null)
            setFiles(picked)
          }}
        />

        {fileInfo ? <p className="text-xs text-muted-foreground">{fileInfo}</p> : null}

        <PdfMergeList
          files={files}
          onMove={(index, direction) => {
            setFiles((prev) => moveItem(prev, index, direction))
          }}
          onRemove={(index) => {
            setFiles((prev) => prev.filter((_, i) => i !== index))
          }}
        />

        <ProcessingStatus pending={pending} error={error} />
        <UploadProgress value={pending ? progress : null} />

        <div className="space-y-4">
          <Button
            type="button"
            className="w-full"
            disabled={files.length < 2 || pending}
            onClick={async () => {
              if (files.length < 2) return
              setResult(null)
              try {
                const res = await run((onProgress) => mergePdfs(files, onProgress))
                setResult(res)
              } catch {
                // Error message is handled by useFileUpload.
              }
            }}
          >
            {pending ? t('pdf.merge.processing') : t('pdf.merge.startMerge')}
          </Button>

          {result ? (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs text-muted-foreground">
                {t('pdf.merge.output', { filename: result.filename, size: formatBytes(result.size) })}
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
