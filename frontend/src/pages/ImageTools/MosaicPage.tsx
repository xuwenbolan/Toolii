import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { BeforeAfterPreview } from '@/components/tools/BeforeAfterPreview'
import { ArtifactPreviewCard } from '@/components/tools/ArtifactPreviewCard'
import { DownloadButton } from '@/components/tools/DownloadButton'
import { ProcessingStatus } from '@/components/tools/ProcessingStatus'
import { RegionSelector, type Region } from '@/components/tools/RegionSelector'
import { SEOHead } from '@/components/common/SEOHead'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { UploadProgress } from '@/components/upload/UploadProgress'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useFileUpload } from '@/hooks/useFileUpload'
import { useObjectUrl } from '@/hooks/useObjectUrl'
import { formatBytes } from '@/lib/fileValidation'
import { isIntInRange, parseFiniteNumber } from '@/lib/numberInput'
import { mosaicImage, type FileResult } from '@/services/imageApi'

type MosaicMode = 'full' | 'region'

export function MosaicPage() {
  const { t } = useTranslation('tools')
  const [file, setFile] = useState<File | null>(null)
  const [pixelSizeInput, setPixelSizeInput] = useState('16')
  const [mode, setMode] = useState<MosaicMode>('full')
  const [regions, setRegions] = useState<Region[]>([])
  const [result, setResult] = useState<FileResult | null>(null)
  const { pending, progress, error, reset, run } = useFileUpload()
  const inputPreviewUrl = useObjectUrl(file)

  const fileInfo = useMemo(() => {
    if (!file) return null
    return `${file.name} · ${formatBytes(file.size)}`
  }, [file])

  const handleFiles = useCallback(
    (files: File[]) => {
      reset()
      setResult(null)
      setRegions([])
      setFile(files[0] ?? null)
    },
    [reset],
  )

  const canSubmit = file && !pending && (mode === 'full' || regions.length > 0)
  const pixelSize = parseFiniteNumber(pixelSizeInput)
  const pixelSizeValid = pixelSize != null && isIntInRange(pixelSize, 2, 80)

  return (
    <>
      <SEOHead title={t('mosaic.seoTitle')} description={t('mosaic.seoDescription')} keywords={t('mosaic.seoKeywords')} canonicalPath="/image-tools/mosaic" />
      <ToolPageShell title={t('mosaic.title')} description={t('mosaic.description')}>
      <div className="space-y-5">
        <FileDropzone
          accept="image/*"
          onFiles={handleFiles}
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

        {/* Mode toggle tabs */}
        {file && (
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            <button
              type="button"
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                mode === 'full' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setMode('full')}
            >
              {t('mosaic.fullMode')}
            </button>
            <button
              type="button"
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                mode === 'region' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setMode('region')}
            >
              {t('mosaic.regionMode')}
            </button>
          </div>
        )}

        {/* Region selector */}
        {file && inputPreviewUrl && mode === 'region' && (
          <RegionSelector imageUrl={inputPreviewUrl} regions={regions} onChange={setRegions} />
        )}

        <div className="space-y-2">
          <Label htmlFor="pixelSize">{t('mosaic.pixelSizeLabel')}</Label>
          <Input
            id="pixelSize"
            type="number"
            min={2}
            max={80}
            value={pixelSizeInput}
            onChange={(e) => setPixelSizeInput(e.target.value)}
          />
        </div>

        <ProcessingStatus pending={pending} error={error} />
        <UploadProgress value={pending ? progress : null} />

        <div className="space-y-4">
          <Button
            type="button"
            className="w-full"
            disabled={!canSubmit || !pixelSizeValid}
            onClick={async () => {
              if (!file || !pixelSizeValid || pixelSize == null) return
              setResult(null)
              try {
                const res = await run((onProgress) =>
                  mosaicImage(
                    file,
                    {
                      pixelSize,
                      regions: mode === 'region' ? regions : undefined,
                    },
                    onProgress,
                  ),
                )
                setResult(res)
              } catch {
                // Error handled by useFileUpload.
              }
            }}
          >
            {pending ? t('mosaic.processing') : t('mosaic.startProcess')}
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
