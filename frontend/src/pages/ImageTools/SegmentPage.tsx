import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, RotateCcw, Undo2 } from 'lucide-react'

import { SEOHead } from '@/components/common/SEOHead'
import { buildBreadcrumbJsonLd, buildToolJsonLd } from '@/lib/jsonLd'
import { ToolActionBar } from '@/components/tools/ToolActionBar'
import { ToolErrorBanner } from '@/components/tools/ToolErrorBanner'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { ToolWorkspaceDropzone } from '@/components/tools/ToolWorkspaceDropzone'
import { Button } from '@/components/ui/button'
import { useObjectUrl } from '@/hooks/useObjectUrl'
import { useToolRunState } from '@/hooks/useToolRunState'
import { formatBytes } from '@/lib/fileValidation'
import { cn } from '@/lib/utils'
import { segmentImage } from '@/services/imageApi'

type PointLabel = 1 | 0 // 1 = foreground, 0 = background
type PromptPoint = { x: number; y: number; label: PointLabel }

const MAX_CANVAS_WIDTH = 1080
const MAX_CANVAS_HEIGHT = 700
const MASK_ALPHA = 0.4
const FG_COLOR = 'rgba(34,197,94,0.9)' // green
const BG_COLOR = 'rgba(239,68,68,0.9)' // red
const POINT_RADIUS = 6

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function createCanvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

function getFittedSize(w: number, h: number) {
  const scale = Math.min(MAX_CANVAS_WIDTH / w, MAX_CANVAS_HEIGHT / h, 1)
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  }
}

export function SegmentPage() {
  const { t } = useTranslation(['tools', 'common'])
  const [file, setFile] = useState<File | null>(null)
  const [points, setPoints] = useState<PromptPoint[]>([])
  const [maskUrl, setMaskUrl] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [canvasReady, setCanvasReady] = useState(false)
  const [score, setScore] = useState<number | null>(null)

  const inputPreviewUrl = useObjectUrl(file)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const maskImageRef = useRef<HTMLImageElement | null>(null)
  const originalImageRef = useRef<HTMLImageElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fileInfo = useMemo(() => {
    if (!file) return null
    return `${file.name} · ${formatBytes(file.size)}`
  }, [file])

  const runState = useToolRunState({
    mode: 'manual',
    hasInput: Boolean(file),
    hasResult: Boolean(maskUrl),
    pending,
    error,
    texts: {
      input: fileInfo ?? undefined,
      result: score != null ? `Score: ${score.toFixed(3)}` : undefined,
    },
  })

  const clearEditor = useCallback(() => {
    setCanvasReady(false)
    setPoints([])
    setMaskUrl(null)
    setScore(null)
    setError(null)
    setPending(false)
    sourceCanvasRef.current = null
    maskImageRef.current = null
    originalImageRef.current = null
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
  }, [])

  // Render canvas: source image + mask overlay + point markers
  const renderCanvas = useCallback(() => {
    const previewCanvas = canvasRef.current
    const sourceCanvas = sourceCanvasRef.current
    if (!previewCanvas || !sourceCanvas) return

    const ctx = previewCanvas.getContext('2d')
    if (!ctx) return
    const w = previewCanvas.width
    const h = previewCanvas.height

    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(sourceCanvas, 0, 0)

    // Draw mask overlay
    const maskImage = maskImageRef.current
    if (maskImage && maskImage.complete && maskImage.naturalWidth > 0) {
      // Tint mask: blue semi-transparent
      const overlay = createCanvas(w, h)
      const overlayCtx = overlay.getContext('2d')
      if (overlayCtx) {
        overlayCtx.fillStyle = 'rgba(59,130,246,0.7)'
        overlayCtx.fillRect(0, 0, w, h)
        overlayCtx.globalCompositeOperation = 'destination-in'
        overlayCtx.drawImage(maskImage, 0, 0, w, h)
        ctx.globalAlpha = MASK_ALPHA
        ctx.drawImage(overlay, 0, 0)
        ctx.globalAlpha = 1
      }
    }

    // Draw point markers
    for (const pt of points) {
      const sx = (pt.x / (originalImageRef.current?.naturalWidth ?? w)) * w
      const sy = (pt.y / (originalImageRef.current?.naturalHeight ?? h)) * h
      ctx.beginPath()
      ctx.arc(sx, sy, POINT_RADIUS, 0, Math.PI * 2)
      ctx.fillStyle = pt.label === 1 ? FG_COLOR : BG_COLOR
      ctx.fill()
      ctx.strokeStyle = 'white'
      ctx.lineWidth = 2
      ctx.stroke()
    }
  }, [points])

  // Call SAM2 API
  const runSegment = useCallback(
    async (nextPoints: PromptPoint[]) => {
      if (!file || nextPoints.length === 0) return

      if (abortRef.current) abortRef.current.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setPending(true)
      setError(null)

      try {
        const apiPoints = nextPoints.map((p) => [p.x, p.y, p.label])
        const result = await segmentImage(file, { points: apiPoints })

        if (controller.signal.aborted) return

        // Decode mask_b64 into an Image
        const maskSrc = `data:image/png;base64,${result.mask_b64}`
        const img = new Image()
        img.onload = () => {
          if (controller.signal.aborted) return
          maskImageRef.current = img
          setMaskUrl(maskSrc)
          setScore(result.score)
          renderCanvas()
        }
        img.src = maskSrc
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'Segmentation failed')
      } finally {
        if (!controller.signal.aborted) setPending(false)
      }
    },
    [file, renderCanvas],
  )

  // Handle click on canvas
  const onCanvasClick = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasReady || pending) return

      const previewCanvas = canvasRef.current
      const origImage = originalImageRef.current
      if (!previewCanvas || !origImage) return

      const rect = previewCanvas.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return

      // Convert click to original image coordinates
      const scaleX = origImage.naturalWidth / previewCanvas.width
      const scaleY = origImage.naturalHeight / previewCanvas.height
      const cx = clamp(((event.clientX - rect.left) / rect.width) * previewCanvas.width, 0, previewCanvas.width)
      const cy = clamp(((event.clientY - rect.top) / rect.height) * previewCanvas.height, 0, previewCanvas.height)
      const x = Math.round(cx * scaleX)
      const y = Math.round(cy * scaleY)

      // Right click = background (label 0), left click = foreground (label 1)
      const label: PointLabel = event.button === 2 ? 0 : 1
      const newPoint: PromptPoint = { x, y, label }
      const nextPoints = [...points, newPoint]
      setPoints(nextPoints)
      void runSegment(nextPoints)
    },
    [canvasReady, pending, points, runSegment],
  )

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
  }, [])

  const onUndo = useCallback(() => {
    if (points.length === 0) return
    const nextPoints = points.slice(0, -1)
    setPoints(nextPoints)
    if (nextPoints.length === 0) {
      maskImageRef.current = null
      setMaskUrl(null)
      setScore(null)
      renderCanvas()
    } else {
      void runSegment(nextPoints)
    }
  }, [points, renderCanvas, runSegment])

  const onReset = useCallback(() => {
    setPoints([])
    maskImageRef.current = null
    setMaskUrl(null)
    setScore(null)
    setError(null)
    renderCanvas()
  }, [renderCanvas])

  // Download foreground cutout (apply mask to original image)
  const onDownload = useCallback(() => {
    if (!originalImageRef.current || !maskImageRef.current || !file) return

    const origW = originalImageRef.current.naturalWidth
    const origH = originalImageRef.current.naturalHeight

    // Draw original
    const output = createCanvas(origW, origH)
    const ctx = output.getContext('2d')
    if (!ctx) return
    ctx.drawImage(originalImageRef.current, 0, 0)

    // Apply mask as alpha
    ctx.globalCompositeOperation = 'destination-in'
    ctx.drawImage(maskImageRef.current, 0, 0, origW, origH)

    output.toBlob((blob) => {
      if (!blob) return
      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)
      const stem = file.name.replace(/\.[^.]+$/, '')
      link.href = url
      link.download = `${stem}-cutout.png`
      link.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }, [file])

  // Load image into canvas
  useEffect(() => {
    if (!inputPreviewUrl) return

    let active = true
    const image = new Image()
    image.onload = () => {
      if (!active) return
      originalImageRef.current = image
      const { width, height } = getFittedSize(image.naturalWidth, image.naturalHeight)

      const previewCanvas = canvasRef.current
      if (!previewCanvas) return
      previewCanvas.width = width
      previewCanvas.height = height

      const sourceCanvas = createCanvas(width, height)
      const sourceCtx = sourceCanvas.getContext('2d')
      if (!sourceCtx) return
      sourceCtx.drawImage(image, 0, 0, width, height)
      sourceCanvasRef.current = sourceCanvas

      setCanvasReady(true)
    }
    image.src = inputPreviewUrl
    return () => {
      active = false
    }
  }, [inputPreviewUrl])

  // Re-render when canvas ready or mask/points change
  useEffect(() => {
    if (!canvasReady) return
    renderCanvas()
  }, [canvasReady, renderCanvas, maskUrl, points])

  return (
    <>
      <SEOHead
        title={t('segment.seoTitle')}
        description={t('segment.seoDescription')}
        keywords={t('segment.seoKeywords')}
        canonicalPath="/image-tools/segment"
        jsonLd={[buildToolJsonLd({ name: t('segment.seoTitle'), description: t('segment.seoDescription'), url: '/image-tools/segment' }), buildBreadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: t('title'), path: '/image-tools' }, { name: t('segment.title'), path: '/image-tools/segment' }])]}
      />
      <ToolPageShell title={t('segment.title')} description={t('segment.description')} backTo="/image-tools" layout="workspace" width="wide">
        <div className="space-y-5 tool-section-stagger">
          <ToolWorkspaceDropzone
            accept={{ 'image/*': [] }}
            multiple={false}
            maxFiles={1}
            onFiles={(files) => {
              clearEditor()
              setFile(files[0] ?? null)
            }}
            title={file ? undefined : t('segment.dropTitle')}
            hint={file ? undefined : t('segment.dropHint')}
            className={file ? 'min-h-[10rem]' : 'min-h-[14rem]'}
          />
          <ToolErrorBanner error={error} onRetry={points.length > 0 ? () => void runSegment(points) : undefined} />

          {file ? (
            <div className="space-y-4 rounded-xl border border-border/70 bg-card/70 p-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">{t('segment.clickHint')}</p>
                {fileInfo ? <p className="text-xs text-muted-foreground">{fileInfo}</p> : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={onUndo} disabled={points.length === 0 || pending}>
                  <Undo2 className="h-4 w-4" />
                  {t('segment.undo')}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={onReset} disabled={points.length === 0 || pending}>
                  <RotateCcw className="h-4 w-4" />
                  {t('segment.reset')}
                </Button>

                {score != null ? (
                  <span className="text-xs text-muted-foreground">
                    {t('segment.score')}: {score.toFixed(3)}
                  </span>
                ) : null}

                <div className="ml-auto">
                  <Button type="button" size="sm" onClick={onDownload} disabled={!maskUrl || pending}>
                    <Download className="h-4 w-4" />
                    {t('segment.download')}
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-full bg-success" />
                  {t('segment.leftClick')}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-full bg-destructive" />
                  {t('segment.rightClick')}
                </span>
              </div>

              <div className={cn('rounded-xl border border-border/70 bg-muted/10 p-2 sm:p-3', !canvasReady && 'animate-pulse')}>
                <div className="flex justify-center overflow-auto">
                  <canvas
                    ref={canvasRef}
                    className={cn(
                      'h-auto max-h-[70vh] w-auto max-w-full touch-none rounded-md bg-white/70 shadow-sm',
                      pending && 'pointer-events-none opacity-70',
                    )}
                    onClick={onCanvasClick}
                    onContextMenu={onContextMenu}
                    onMouseDown={(e) => {
                      // Handle right-click via mousedown to support background points
                      if (e.button === 2) {
                        onCanvasClick(e)
                      }
                    }}
                    aria-label={t('segment.title')}
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">{t('segment.dragHint')}</p>
            </div>
          ) : null}
        </div>
      </ToolPageShell>

      <ToolActionBar mode="manual" status={runState.statusText} pending={pending} progress={pending ? 50 : 0} error={error} done={runState.phase === 'done'} />
    </>
  )
}
