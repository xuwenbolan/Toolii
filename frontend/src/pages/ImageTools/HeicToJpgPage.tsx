import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DownloadButton } from '@/components/tools/DownloadButton'
import { ProcessingStatus } from '@/components/tools/ProcessingStatus'
import { SEOHead } from '@/components/common/SEOHead'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { UploadProgress } from '@/components/upload/UploadProgress'
import { Button } from '@/components/ui/button'
import { useFileUpload } from '@/hooks/useFileUpload'
import { formatBytes } from '@/lib/fileValidation'
import { convertImage, type FileResult } from '@/services/imageApi'

export function HeicToJpgPage() {
  const { t } = useTranslation('tools')
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<FileResult | null>(null)
  const { pending, progress, error, reset, run } = useFileUpload()

  const fileInfo = useMemo(() => {
    if (!file) return null
    return `${file.name} · ${formatBytes(file.size)}`
  }, [file])

  return (
    <>
      <SEOHead title={t('heicToJpg.seoTitle')} description={t('heicToJpg.seoDescription')} keywords={t('heicToJpg.seoKeywords')} canonicalPath="/image-tools/heic-to-jpg" />
      <ToolPageShell title={t('heicToJpg.title')} description={t('heicToJpg.description')}>
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
                  convertImage(file, { outputFormat: 'jpeg', quality: 92 }, onProgress),
                )
                setResult(res)
              } catch {
                // Error message is handled by useFileUpload.
              }
            }}
          >
            {pending ? t('heicToJpg.processing') : t('heicToJpg.startConvert')}
          </Button>

          {result ? (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs text-muted-foreground">
                {t('heicToJpg.output', { filename: result.filename, size: formatBytes(result.size) })}
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
