import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SEOHead } from '@/components/common/SEOHead'
import { BeforeAfterPreview } from '@/components/tools/BeforeAfterPreview'
import { ArtifactPreviewCard } from '@/components/tools/ArtifactPreviewCard'
import { DownloadButton } from '@/components/tools/DownloadButton'
import { ProcessingStatus } from '@/components/tools/ProcessingStatus'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { UploadProgress } from '@/components/upload/UploadProgress'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useFileUpload } from '@/hooks/useFileUpload'
import { useObjectUrl } from '@/hooks/useObjectUrl'
import { formatBytes } from '@/lib/fileValidation'
import { removeBackground, type FileResult } from '@/services/imageApi'

export function RemoveBgPage() {
  const { t } = useTranslation('tools')
  const [file, setFile] = useState<File | null>(null)
  const [modelName, setModelName] = useState('silueta')
  const [result, setResult] = useState<FileResult | null>(null)
  const { pending, progress, error, reset, run } = useFileUpload()
  const inputPreviewUrl = useObjectUrl(file)

  const fileInfo = useMemo(() => {
    if (!file) return null
    return `${file.name} · ${formatBytes(file.size)}`
  }, [file])

  return (
    <>
      <SEOHead title={t('removeBg.seoTitle')} description={t('removeBg.seoDescription')} keywords={t('removeBg.seoKeywords')} canonicalPath="/image-tools/remove-bg" />
      <ToolPageShell title={t('removeBg.title')} description={t('removeBg.description')}>
        <div className="space-y-5">
          <FileDropzone
            accept="image/*"
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
              mediaKind="image"
              mediaUrl={inputPreviewUrl}
            />
          ) : null}

          <div className="space-y-2">
            <Label>{t('removeBg.modelLabel')}</Label>
            <Select value={modelName} onValueChange={setModelName}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="silueta">{t('removeBg.modelFast')}</SelectItem>
                <SelectItem value="u2net_human_seg">{t('removeBg.modelBalanced')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">{t('removeBg.outputHint')}</p>

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
                  const res = await run((onProgress) => removeBackground(file, { modelName }, onProgress))
                  setResult(res)
                } catch {
                  // Error handled by useFileUpload
                }
              }}
            >
              {pending ? t('removeBg.processing') : t('removeBg.startProcess')}
            </Button>

            {result ? (
              <div className="space-y-3">
                {fileInfo ? (
                  <BeforeAfterPreview
                    beforeFilename={file?.name ?? '-'}
                    beforeSizeText={file ? formatBytes(file.size) : undefined}
                    beforeUrl={inputPreviewUrl}
                    afterFilename={result.filename}
                    afterSizeText={formatBytes(result.size)}
                    afterUrl={result.download_url}
                  />
                ) : null}
                <ArtifactPreviewCard
                  label={t('common:preview.output')}
                  filename={result.filename}
                  sizeText={formatBytes(result.size)}
                  mediaKind="image"
                  mediaUrl={result.download_url}
                  action={<DownloadButton url={result.download_url} className="w-auto" />}
                />
              </div>
            ) : null}
          </div>
        </div>
      </ToolPageShell>
    </>
  )
}
