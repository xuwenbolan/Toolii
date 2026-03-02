import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ImageCompareSlider } from '@/components/tools/ImageCompareSlider'
import { ToolActionBar } from '@/components/tools/ToolActionBar'
import { ToolResultPanel } from '@/components/tools/ToolResultPanel'
import { ToolErrorBanner } from '@/components/tools/ToolErrorBanner'
import { DownloadButton } from '@/components/tools/DownloadButton'
import { SEOHead } from '@/components/common/SEOHead'
import { buildBreadcrumbJsonLd, buildToolJsonLd } from '@/lib/jsonLd'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { ToolWorkspaceDropzone } from '@/components/tools/ToolWorkspaceDropzone'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useFileUpload } from '@/hooks/useFileUpload'
import { useObjectUrl } from '@/hooks/useObjectUrl'
import { useToolRunState } from '@/hooks/useToolRunState'
import { formatBytes } from '@/lib/fileValidation'
import { isIntInRange, parseFiniteNumber } from '@/lib/numberInput'
import { ShareTransferButton } from '@/components/tools/ShareTransferButton'
import { compressImage, type FileResult } from '@/services/imageApi'

const PREVIEW_MAX_DIMENSION = 2200

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(image)
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('failed-to-load-image'))
    }

    image.src = objectUrl
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('failed-to-generate-preview'))
          return
        }
        resolve(blob)
      },
      type,
      quality,
    )
  })
}

async function generateCompressPreview(file: File, qualityPercent: number) {
  const image = await loadImageFromFile(file)
  const scale = Math.min(PREVIEW_MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight), 1)
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas-context-unavailable')

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.clearRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)

  const outputType = file.type === 'image/webp' ? 'image/webp' : 'image/jpeg'
  const blob = await canvasToBlob(canvas, outputType, qualityPercent / 100)

  return {
    url: URL.createObjectURL(blob),
    size: blob.size,
  }
}

export function CompressPage() {
  const { t } = useTranslation(['tools', 'common'])
  const [file, setFile] = useState<File | null>(null)
  const [qualityInput, setQualityInput] = useState('80')
  const [targetKbInput, setTargetKbInput] = useState('')
  const [result, setResult] = useState<FileResult | null>(null)
  const [resultPanelOpen, setResultPanelOpen] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewSize, setPreviewSize] = useState<number | null>(null)
  const [previewPending, setPreviewPending] = useState(false)
  const previewSeqRef = useRef(0)
  const previewUrlRef = useRef<string | null>(null)
  const { pending, progress, error, errorMeta, reset, run, retry } = useFileUpload()
  const inputPreviewUrl = useObjectUrl(file)

  const quality = parseFiniteNumber(qualityInput)
  const targetKb = parseFiniteNumber(targetKbInput)
  const qualityValid = quality != null && isIntInRange(quality, 1, 100)
  const targetKbValid = targetKbInput.trim() === '' || (targetKb != null && isIntInRange(targetKb, 1, 1_000_000))
  const formValid = qualityValid && targetKbValid

  const clearPreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setPreviewUrl(null)
    setPreviewSize(null)
    setPreviewPending(false)
  }, [])

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!file || !qualityValid || quality == null) {
      clearPreview()
      return
    }

    const seq = ++previewSeqRef.current
    setPreviewPending(true)

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const preview = await generateCompressPreview(file, quality)
          if (seq !== previewSeqRef.current) {
            URL.revokeObjectURL(preview.url)
            return
          }

          if (previewUrlRef.current) {
            URL.revokeObjectURL(previewUrlRef.current)
          }
          previewUrlRef.current = preview.url
          setPreviewUrl(preview.url)
          setPreviewSize(preview.size)
        } catch {
          if (seq === previewSeqRef.current) {
            clearPreview()
          }
        } finally {
          if (seq === previewSeqRef.current) {
            setPreviewPending(false)
          }
        }
      })()
    }, 180)

    return () => {
      window.clearTimeout(timer)
    }
  }, [clearPreview, file, quality, qualityValid])

  const fileInfo = useMemo(() => {
    if (!file) return undefined

    const parts = [`${file.name} · ${formatBytes(file.size)}`]
    if (previewPending) {
      parts.push(t('compress.previewEstimating'))
    } else if (previewSize != null) {
      parts.push(t('compress.previewEstimate', { size: formatBytes(previewSize) }))
    }

    return parts.join(' · ')
  }, [file, previewPending, previewSize, t])

  const resultInfo = result ? `${result.filename} · ${formatBytes(result.size)}` : undefined
  const runState = useToolRunState({
    mode: 'manual',
    hasInput: Boolean(file),
    hasResult: Boolean(result),
    pending,
    error,
    texts: {
      input: fileInfo,
      result: resultInfo,
    },
  })
  const canRun = runState.canRun && formValid

  const compareAfterUrl = result?.download_url ?? previewUrl
  const compareAfterSize = result?.size ?? previewSize ?? undefined

  const handleCompress = async () => {
    if (!file || !formValid || quality == null) return
    setResult(null)
    setResultPanelOpen(false)

    try {
      const res = await run((onProgress) =>
        compressImage(
          file,
          {
            quality,
            targetKb: targetKbInput.trim() === '' ? undefined : (targetKb ?? undefined),
          },
          onProgress,
        ),
      )
      setResult(res)
      setResultPanelOpen(true)
    } catch {
      // Error message is handled by useFileUpload.
    }
  }

  return (
    <>
      <SEOHead title={t('compress.seoTitle')} description={t('compress.seoDescription')} keywords={t('compress.seoKeywords')} canonicalPath="/image-tools/compress" jsonLd={[buildToolJsonLd({ name: t('compress.seoTitle'), description: t('compress.seoDescription'), url: '/image-tools/compress' }), buildBreadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: t('title'), path: '/image-tools' }, { name: t('compress.title'), path: '/image-tools/compress' }])]} />
      <ToolPageShell
        title={t('compress.title')}
        description={t('compress.description')}
        backTo="/image-tools"
        layout="workspace"
        width="wide"
      >
        <div className="space-y-5 tool-section-stagger">
          <ToolWorkspaceDropzone
            accept={{ 'image/*': [] }}
            multiple={false}
            maxFiles={1}
            onFiles={(files) => {
              previewSeqRef.current += 1
              clearPreview()
              reset()
              setResult(null)
              setResultPanelOpen(false)
              setFile(files[0] ?? null)
            }}
            title={t('compress.dropTitle', t('common:upload.dropHere'))}
            hint={t('compress.dropHint', t('common:upload.orSelectBelow'))}
          />

          <ToolErrorBanner
            error={error}
            errorMeta={errorMeta}
            onRetry={file ? () => retry() : undefined}
          />

          {file && inputPreviewUrl && compareAfterUrl ? (
            <ImageCompareSlider
              beforeUrl={inputPreviewUrl}
              afterUrl={compareAfterUrl}
              beforeAlt={file.name}
              afterAlt={result?.filename ?? file.name}
              beforeMeta={formatBytes(file.size)}
              afterMeta={compareAfterSize ? formatBytes(compareAfterSize) : undefined}
            />
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="quality-range">{t('compress.qualityLabel')}</Label>
              <input
                id="quality-range"
                type="range"
                min={1}
                max={100}
                step={1}
                value={qualityInput}
                onChange={(event) => setQualityInput(event.target.value)}
                className="w-full accent-primary"
              />
              <Input
                id="quality"
                type="number"
                min={1}
                max={100}
                value={qualityInput}
                onChange={(event) => setQualityInput(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="targetKb">{t('compress.targetSizeLabel')}</Label>
              <Input
                id="targetKb"
                type="number"
                min={1}
                placeholder={t('compress.targetSizePlaceholder')}
                value={targetKbInput}
                onChange={(event) => setTargetKbInput(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('compress.targetSizeHint')}</p>
            </div>
          </div>
        </div>
      </ToolPageShell>

      <ToolActionBar
        mode="manual"
        status={runState.statusText}
        pending={pending}
        progress={progress}
        error={error}
        done={runState.phase === 'done'}
        ctaLabel={t('compress.startCompress')}
        ctaDisabled={!canRun}
        onCta={() => {
          void handleCompress()
        }}
        maxWidthClassName="max-w-6xl"
      />

      <ToolResultPanel
        open={Boolean(result && resultPanelOpen)}
        title={t('common:actions.downloadResult')}
        onClose={() => setResultPanelOpen(false)}
      >
        {result && file && inputPreviewUrl ? (
          <div className="space-y-4">
            <ImageCompareSlider
              beforeUrl={inputPreviewUrl}
              afterUrl={result.download_url}
              beforeAlt={file.name}
              afterAlt={result.filename}
              beforeMeta={formatBytes(file.size)}
              afterMeta={formatBytes(result.size)}
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setResultPanelOpen(false)}>
                {t('common:actions.back')}
              </Button>
              <ShareTransferButton fileId={result.file_id} className="w-auto" />
              <DownloadButton url={result.download_url} className="w-auto" />
            </div>
          </div>
        ) : null}
      </ToolResultPanel>
    </>
  )
}
