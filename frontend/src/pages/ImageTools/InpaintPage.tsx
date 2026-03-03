import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Brush, Eraser, Redo2, RotateCcw, Undo2 } from 'lucide-react'

import { SEOHead } from '@/components/common/SEOHead'
import { buildBreadcrumbJsonLd, buildToolJsonLd } from '@/lib/jsonLd'
import { BeforeAfterPreview } from '@/components/tools/BeforeAfterPreview'
import { DownloadButton } from '@/components/tools/DownloadButton'
import { ToolActionBar } from '@/components/tools/ToolActionBar'
import { ToolErrorBanner } from '@/components/tools/ToolErrorBanner'
import { ToolResultPanel } from '@/components/tools/ToolResultPanel'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { ToolWorkspaceDropzone } from '@/components/tools/ToolWorkspaceDropzone'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useFileUpload } from '@/hooks/useFileUpload'
import { useObjectUrl } from '@/hooks/useObjectUrl'
import { useToolRunState } from '@/hooks/useToolRunState'
import { formatBytes } from '@/lib/fileValidation'
import { ShareTransferButton } from '@/components/tools/ShareTransferButton'
import { cn } from '@/lib/utils'
import { inpaintImage, type FileResult } from '@/services/imageApi'

type InpaintTool = 'brush' | 'eraser'
type Point = { x: number; y: number }

const MAX_CANVAS_WIDTH = 1080
const MAX_CANVAS_HEIGHT = 700
const MASK_OVERLAY_ALPHA = 0.45
const MASK_COLOR = 'rgba(255,60,60,0.85)'

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function getFittedSize(width: number, height: number) {
  const scale = Math.min(MAX_CANVAS_WIDTH / width, MAX_CANVAS_HEIGHT / height, 1)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export function InpaintPage() {
  const { t } = useTranslation(['tools', 'common'])
  const [file, setFile] = useState<File | null>(null)
  const [activeTool, setActiveTool] = useState<InpaintTool>('brush')
  const [brushSize, setBrushSize] = useState(34)
  const [isDrawing, setIsDrawing] = useState(false)
  const [canvasReady, setCanvasReady] = useState(false)
  const [historyMeta, setHistoryMeta] = useState({ index: -1, size: 0 })
  const [result, setResult] = useState<FileResult | null>(null)
  const [resultPanelOpen, setResultPanelOpen] = useState(false)
  const { pending, progress, error, errorMeta, reset, run, retry } = useFileUpload()
  const inputPreviewUrl = useObjectUrl(file)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const originalImageRef = useRef<HTMLImageElement | null>(null)
  const lastPointRef = useRef<Point | null>(null)
  const historyRef = useRef<ImageData[]>([])
  const historyIndexRef = useRef(-1)

  const fileInfo = useMemo(() => {
    if (!file) return null
    return `${file.name} · ${formatBytes(file.size)}`
  }, [file])
  const resultInfo = result ? `${result.filename} · ${formatBytes(result.size)}` : undefined
  const runState = useToolRunState({
    mode: 'manual',
    hasInput: Boolean(file),
    hasResult: Boolean(result),
    pending,
    error,
    texts: { input: fileInfo ?? undefined, result: resultInfo },
  })

  const syncHistoryMeta = useCallback(() => {
    setHistoryMeta({
      index: historyIndexRef.current,
      size: historyRef.current.length,
    })
  }, [])

  const clearEditor = useCallback(() => {
    setCanvasReady(false)
    setIsDrawing(false)
    sourceCanvasRef.current = null
    maskCanvasRef.current = null
    originalImageRef.current = null
    lastPointRef.current = null
    historyRef.current = []
    historyIndexRef.current = -1
    syncHistoryMeta()
  }, [syncHistoryMeta])

  const renderCanvas = useCallback(() => {
    const previewCanvas = canvasRef.current
    const sourceCanvas = sourceCanvasRef.current
    const maskCanvas = maskCanvasRef.current
    if (!previewCanvas || !sourceCanvas || !maskCanvas) return

    const ctx = previewCanvas.getContext('2d')
    if (!ctx) return

    const w = previewCanvas.width
    const h = previewCanvas.height

    // Draw source image
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(sourceCanvas, 0, 0)

    // Build tinted overlay: red fill masked by the painted mask
    const overlay = createCanvas(w, h)
    const overlayCtx = overlay.getContext('2d')
    if (!overlayCtx) return
    overlayCtx.fillStyle = MASK_COLOR
    overlayCtx.fillRect(0, 0, w, h)
    overlayCtx.globalCompositeOperation = 'destination-in'
    overlayCtx.drawImage(maskCanvas, 0, 0)

    ctx.globalAlpha = MASK_OVERLAY_ALPHA
    ctx.drawImage(overlay, 0, 0)
    ctx.globalAlpha = 1
  }, [])

  const pushHistorySnapshot = useCallback(() => {
    const maskCanvas = maskCanvasRef.current
    const maskCtx = maskCanvas?.getContext('2d')
    if (!maskCanvas || !maskCtx) return

    const snapshot = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height)
    const truncated = historyRef.current.slice(0, historyIndexRef.current + 1)
    truncated.push(snapshot)
    historyRef.current = truncated
    historyIndexRef.current = truncated.length - 1
    syncHistoryMeta()
  }, [syncHistoryMeta])

  const restoreHistorySnapshot = useCallback(
    (index: number) => {
      const maskCanvas = maskCanvasRef.current
      const maskCtx = maskCanvas?.getContext('2d')
      if (!maskCanvas || !maskCtx) return
      const snapshot = historyRef.current[index]
      if (!snapshot) return
      maskCtx.putImageData(snapshot, 0, 0)
      historyIndexRef.current = index
      syncHistoryMeta()
    },
    [syncHistoryMeta],
  )

  const resetMask = useCallback(() => {
    const maskCanvas = maskCanvasRef.current
    const maskCtx = maskCanvas?.getContext('2d')
    if (!maskCanvas || !maskCtx) return

    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height)
    const blank = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height)
    historyRef.current = [blank]
    historyIndexRef.current = 0
    syncHistoryMeta()
    renderCanvas()
  }, [renderCanvas, syncHistoryMeta])

  const drawLineToMask = useCallback(
    (from: Point, to: Point, erase: boolean) => {
      const maskCanvas = maskCanvasRef.current
      const maskCtx = maskCanvas?.getContext('2d')
      if (!maskCanvas || !maskCtx) return

      maskCtx.save()
      maskCtx.globalCompositeOperation = erase ? 'destination-out' : 'source-over'
      maskCtx.strokeStyle = 'rgba(255,255,255,1)'
      maskCtx.lineWidth = clamp(brushSize, 4, 120)
      maskCtx.lineCap = 'round'
      maskCtx.lineJoin = 'round'
      maskCtx.beginPath()
      maskCtx.moveTo(from.x, from.y)
      maskCtx.lineTo(to.x, to.y)
      maskCtx.stroke()
      maskCtx.restore()
    },
    [brushSize],
  )

  const getCanvasPoint = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const previewCanvas = canvasRef.current
    if (!previewCanvas) return null
    const rect = previewCanvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * previewCanvas.width, 0, previewCanvas.width),
      y: clamp(((event.clientY - rect.top) / rect.height) * previewCanvas.height, 0, previewCanvas.height),
    }
  }, [])

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!canvasReady || pending) return
      const point = getCanvasPoint(event)
      if (!point) return

      event.currentTarget.setPointerCapture(event.pointerId)
      setIsDrawing(true)

      const erase = activeTool === 'eraser'
      lastPointRef.current = point
      drawLineToMask(point, point, erase)
      renderCanvas()
    },
    [activeTool, canvasReady, drawLineToMask, getCanvasPoint, pending, renderCanvas],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawing) return
      const point = getCanvasPoint(event)
      if (!point) return

      const erase = activeTool === 'eraser'
      const prev = lastPointRef.current ?? point
      drawLineToMask(prev, point, erase)
      lastPointRef.current = point
      renderCanvas()
    },
    [activeTool, drawLineToMask, getCanvasPoint, isDrawing, renderCanvas],
  )

  const onPointerUp = useCallback(() => {
    if (!isDrawing) return
    lastPointRef.current = null
    setIsDrawing(false)
    pushHistorySnapshot()
    renderCanvas()
  }, [isDrawing, pushHistorySnapshot, renderCanvas])

  const onUndo = useCallback(() => {
    const prevIndex = historyIndexRef.current - 1
    if (prevIndex < 0) return
    restoreHistorySnapshot(prevIndex)
    renderCanvas()
  }, [renderCanvas, restoreHistorySnapshot])

  const onRedo = useCallback(() => {
    const nextIndex = historyIndexRef.current + 1
    if (nextIndex >= historyRef.current.length) return
    restoreHistorySnapshot(nextIndex)
    renderCanvas()
  }, [renderCanvas, restoreHistorySnapshot])

  // Export mask at original image resolution and submit
  const handleSubmit = useCallback(async () => {
    if (!file || !originalImageRef.current || !maskCanvasRef.current || !sourceCanvasRef.current) return

    const naturalWidth = originalImageRef.current.naturalWidth
    const naturalHeight = originalImageRef.current.naturalHeight
    if (naturalWidth <= 0 || naturalHeight <= 0) return

    // Scale mask to original resolution
    const exportMask = createCanvas(naturalWidth, naturalHeight)
    const exportMaskCtx = exportMask.getContext('2d')
    if (!exportMaskCtx) return

    // White on black: Cortex expects white = area to inpaint
    exportMaskCtx.fillStyle = '#000'
    exportMaskCtx.fillRect(0, 0, naturalWidth, naturalHeight)
    exportMaskCtx.drawImage(maskCanvasRef.current, 0, 0, naturalWidth, naturalHeight)

    const maskBlob = await new Promise<Blob | null>((resolve) => exportMask.toBlob(resolve, 'image/png'))
    if (!maskBlob) return

    setResult(null)
    setResultPanelOpen(false)
    try {
      const res = await run((onProgress) => inpaintImage(file, maskBlob, onProgress))
      setResult(res)
      setResultPanelOpen(true)
    } catch {
      // Error handled by useFileUpload
    }
  }, [file, run])

  // Load image into canvas when file changes
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

      const maskCanvas = createCanvas(width, height)
      sourceCanvasRef.current = sourceCanvas
      maskCanvasRef.current = maskCanvas

      const maskCtx = maskCanvas.getContext('2d')
      if (!maskCtx) return
      maskCtx.clearRect(0, 0, width, height)
      const blank = maskCtx.getImageData(0, 0, width, height)
      historyRef.current = [blank]
      historyIndexRef.current = 0
      syncHistoryMeta()

      setCanvasReady(true)
      setIsDrawing(false)
      lastPointRef.current = null
    }
    image.src = inputPreviewUrl

    return () => {
      active = false
    }
  }, [inputPreviewUrl, syncHistoryMeta])

  // Re-render when canvas is ready
  useEffect(() => {
    if (!canvasReady) return
    renderCanvas()
  }, [canvasReady, renderCanvas])

  const canUndo = historyMeta.index > 0
  const canRedo = historyMeta.index >= 0 && historyMeta.index < historyMeta.size - 1

  // Check if mask has any painted pixels
  const hasMask = historyMeta.index > 0 || historyMeta.size > 1

  return (
    <>
      <SEOHead
        title={t('inpaint.seoTitle')}
        description={t('inpaint.seoDescription')}
        keywords={t('inpaint.seoKeywords')}
        canonicalPath="/image-tools/inpaint"
        jsonLd={[buildToolJsonLd({ name: t('inpaint.seoTitle'), description: t('inpaint.seoDescription'), url: '/image-tools/inpaint' }), buildBreadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: t('title'), path: '/image-tools' }, { name: t('inpaint.title'), path: '/image-tools/inpaint' }])]}
      />
      <ToolPageShell title={t('inpaint.title')} description={t('inpaint.description')} backTo="/image-tools" layout="workspace" width="wide">
        <div className="space-y-5">
          <ToolWorkspaceDropzone
            accept={{ 'image/*': [] }}
            multiple={false}
            maxFiles={1}
            onFiles={(files) => {
              reset()
              setResult(null)
              setResultPanelOpen(false)
              clearEditor()
              setFile(files[0] ?? null)
            }}
            title={file ? undefined : t('inpaint.dropTitle')}
            hint={file ? undefined : t('inpaint.dropHint')}
            className={file ? 'min-h-[10rem]' : 'min-h-[14rem]'}
          />
          <ToolErrorBanner error={error} errorMeta={errorMeta} onRetry={file ? () => retry() : undefined} />

          {file ? (
            <div className="space-y-4 rounded-xl border border-border/70 bg-card/70 p-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">{t('inpaint.paintHint')}</p>
                {fileInfo ? <p className="text-xs text-muted-foreground">{fileInfo}</p> : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={activeTool === 'brush' ? 'default' : 'outline'}
                  onClick={() => setActiveTool('brush')}
                >
                  <Brush className="h-4 w-4" />
                  {t('inpaint.toolBrush')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={activeTool === 'eraser' ? 'default' : 'outline'}
                  onClick={() => setActiveTool('eraser')}
                >
                  <Eraser className="h-4 w-4" />
                  {t('inpaint.toolEraser')}
                </Button>

                <div className="mx-1 h-6 w-px bg-border/70" />

                <Button type="button" size="sm" variant="outline" onClick={onUndo} disabled={!canUndo}>
                  <Undo2 className="h-4 w-4" />
                  {t('inpaint.undo')}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={onRedo} disabled={!canRedo}>
                  <Redo2 className="h-4 w-4" />
                  {t('inpaint.redo')}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={resetMask} disabled={!canvasReady}>
                  <RotateCcw className="h-4 w-4" />
                  {t('inpaint.reset')}
                </Button>

                <div className="ml-auto">
                  <Button type="button" size="sm" onClick={handleSubmit} disabled={!canvasReady || !hasMask || pending}>
                    {t('inpaint.startButton')}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="inpaint-brush-size" className="text-xs text-muted-foreground">
                  {t('inpaint.brushSize')}
                </Label>
                <input
                  id="inpaint-brush-size"
                  type="range"
                  min={4}
                  max={120}
                  step={1}
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="w-full max-w-xs accent-primary"
                />
                <p className="text-xs font-medium tabular-nums">{brushSize}</p>
              </div>

              <div className={cn('rounded-xl border border-border/70 bg-muted/10 p-2 sm:p-3', !canvasReady && 'animate-pulse')}>
                <div className="flex justify-center overflow-auto">
                  <canvas
                    ref={canvasRef}
                    className="h-auto max-h-[70vh] w-auto max-w-full touch-none rounded-md bg-white/70 shadow-sm"
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    aria-label={t('inpaint.title')}
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">{t('inpaint.dragHint')}</p>
            </div>
          ) : null}
        </div>
      </ToolPageShell>

      <ToolActionBar mode="manual" status={runState.statusText} pending={pending} progress={progress} error={error} done={runState.phase === 'done'} />

      <ToolResultPanel
        open={Boolean(result && resultPanelOpen)}
        title={t('common:actions.downloadResult')}
        onClose={() => setResultPanelOpen(false)}
      >
        {result && file ? (
          <div className="space-y-4">
            <BeforeAfterPreview
              beforeFilename={file.name}
              beforeSizeText={formatBytes(file.size)}
              beforeUrl={inputPreviewUrl}
              afterFilename={result.filename}
              afterSizeText={formatBytes(result.size)}
              afterUrl={result.download_url}
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
