import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Brush, Download, Eraser, RectangleHorizontal, Redo2, RotateCcw, Undo2 } from 'lucide-react'

import { SEOHead } from '@/components/common/SEOHead'
import { buildBreadcrumbJsonLd, buildToolJsonLd } from '@/lib/jsonLd'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { ToolWorkspaceDropzone } from '@/components/tools/ToolWorkspaceDropzone'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useObjectUrl } from '@/hooks/useObjectUrl'
import { formatBytes } from '@/lib/fileValidation'
import { cn } from '@/lib/utils'

type MosaicTool = 'rect' | 'brush' | 'eraser'
type Point = { x: number; y: number }

const MAX_CANVAS_WIDTH = 1080
const MAX_CANVAS_HEIGHT = 700

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

function buildMosaicLayer(sourceCanvas: HTMLCanvasElement, targetCanvas: HTMLCanvasElement, pixelSize: number) {
  const srcWidth = sourceCanvas.width
  const srcHeight = sourceCanvas.height
  if (srcWidth <= 0 || srcHeight <= 0) return

  const safePixelSize = clamp(Math.round(pixelSize), 2, 96)
  const downscaleWidth = Math.max(1, Math.round(srcWidth / safePixelSize))
  const downscaleHeight = Math.max(1, Math.round(srcHeight / safePixelSize))
  const downscaled = createCanvas(downscaleWidth, downscaleHeight)
  const downscaledCtx = downscaled.getContext('2d')
  const targetCtx = targetCanvas.getContext('2d')
  if (!downscaledCtx || !targetCtx) return

  downscaledCtx.imageSmoothingEnabled = true
  downscaledCtx.clearRect(0, 0, downscaleWidth, downscaleHeight)
  downscaledCtx.drawImage(sourceCanvas, 0, 0, downscaleWidth, downscaleHeight)

  targetCanvas.width = srcWidth
  targetCanvas.height = srcHeight
  targetCtx.imageSmoothingEnabled = false
  targetCtx.clearRect(0, 0, srcWidth, srcHeight)
  targetCtx.drawImage(downscaled, 0, 0, downscaleWidth, downscaleHeight, 0, 0, srcWidth, srcHeight)
}

function stripExt(filename: string) {
  const dotIndex = filename.lastIndexOf('.')
  return dotIndex > 0 ? filename.slice(0, dotIndex) : filename
}

function getOutputMime(inputMime: string) {
  if (inputMime === 'image/png') return 'image/png'
  if (inputMime === 'image/webp') return 'image/webp'
  return 'image/jpeg'
}

export function MosaicPage() {
  const { t } = useTranslation('tools')
  const [file, setFile] = useState<File | null>(null)
  const [tool, setTool] = useState<MosaicTool>('rect')
  const [pixelSize, setPixelSize] = useState(20)
  const [brushSize, setBrushSize] = useState(34)
  const [strength, setStrength] = useState(100)
  const [isDrawing, setIsDrawing] = useState(false)
  const [canvasReady, setCanvasReady] = useState(false)
  const [historyMeta, setHistoryMeta] = useState({ index: -1, size: 0 })
  const inputPreviewUrl = useObjectUrl(file)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const mosaicCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const blendCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const originalImageRef = useRef<HTMLImageElement | null>(null)
  const drawingRectRef = useRef<{ start: Point; current: Point } | null>(null)
  const lastPointRef = useRef<Point | null>(null)
  const historyRef = useRef<ImageData[]>([])
  const historyIndexRef = useRef(-1)

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
    mosaicCanvasRef.current = null
    maskCanvasRef.current = null
    blendCanvasRef.current = null
    originalImageRef.current = null
    drawingRectRef.current = null
    lastPointRef.current = null
    historyRef.current = []
    historyIndexRef.current = -1
    syncHistoryMeta()
  }, [syncHistoryMeta])

  const fileInfo = useMemo(() => {
    if (!file) return null
    return `${file.name} · ${formatBytes(file.size)}`
  }, [file])

  const handleFiles = useCallback(
    (files: File[]) => {
      clearEditor()
      setFile(files[0] ?? null)
    },
    [clearEditor],
  )

  const renderCanvas = useCallback(() => {
    const previewCanvas = canvasRef.current
    const sourceCanvas = sourceCanvasRef.current
    const mosaicCanvas = mosaicCanvasRef.current
    const maskCanvas = maskCanvasRef.current
    const blendCanvas = blendCanvasRef.current
    if (!previewCanvas || !sourceCanvas || !mosaicCanvas || !maskCanvas || !blendCanvas) return

    const previewCtx = previewCanvas.getContext('2d')
    const blendCtx = blendCanvas.getContext('2d')
    if (!previewCtx || !blendCtx) return

    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height)
    previewCtx.drawImage(sourceCanvas, 0, 0)

    blendCtx.clearRect(0, 0, blendCanvas.width, blendCanvas.height)
    blendCtx.globalCompositeOperation = 'source-over'
    blendCtx.globalAlpha = 1
    blendCtx.drawImage(mosaicCanvas, 0, 0)
    blendCtx.globalCompositeOperation = 'destination-in'
    blendCtx.drawImage(maskCanvas, 0, 0)
    blendCtx.globalCompositeOperation = 'source-over'

    previewCtx.globalAlpha = clamp(strength, 0, 100) / 100
    previewCtx.drawImage(blendCanvas, 0, 0)
    previewCtx.globalAlpha = 1

    if (isDrawing && tool === 'rect' && drawingRectRef.current) {
      const { start, current } = drawingRectRef.current
      const x = Math.min(start.x, current.x)
      const y = Math.min(start.y, current.y)
      const w = Math.abs(current.x - start.x)
      const h = Math.abs(current.y - start.y)
      previewCtx.save()
      previewCtx.setLineDash([7, 4])
      previewCtx.lineWidth = 2
      previewCtx.strokeStyle = 'rgba(79,70,229,0.95)'
      previewCtx.fillStyle = 'rgba(79,70,229,0.12)'
      previewCtx.fillRect(x, y, w, h)
      previewCtx.strokeRect(x, y, w, h)
      previewCtx.restore()
    }
  }, [isDrawing, strength, tool])

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

  const restoreHistorySnapshot = useCallback((index: number) => {
    const maskCanvas = maskCanvasRef.current
    const maskCtx = maskCanvas?.getContext('2d')
    if (!maskCanvas || !maskCtx) return
    const snapshot = historyRef.current[index]
    if (!snapshot) return
    maskCtx.putImageData(snapshot, 0, 0)
    historyIndexRef.current = index
    syncHistoryMeta()
  }, [syncHistoryMeta])

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

  const drawLineToMask = useCallback((from: Point, to: Point, erase: boolean) => {
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
  }, [brushSize])

  const fillRectToMask = useCallback((start: Point, end: Point) => {
    const maskCanvas = maskCanvasRef.current
    const maskCtx = maskCanvas?.getContext('2d')
    if (!maskCanvas || !maskCtx) return

    const x = Math.min(start.x, end.x)
    const y = Math.min(start.y, end.y)
    const width = Math.abs(end.x - start.x)
    const height = Math.abs(end.y - start.y)
    if (width < 1 || height < 1) return

    maskCtx.save()
    maskCtx.globalCompositeOperation = 'source-over'
    maskCtx.fillStyle = 'rgba(255,255,255,1)'
    maskCtx.fillRect(x, y, width, height)
    maskCtx.restore()
  }, [])

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

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasReady) return
    const point = getCanvasPoint(event)
    if (!point) return

    event.currentTarget.setPointerCapture(event.pointerId)
    setIsDrawing(true)

    if (tool === 'rect') {
      drawingRectRef.current = { start: point, current: point }
    } else {
      const erase = tool === 'eraser'
      lastPointRef.current = point
      drawLineToMask(point, point, erase)
    }

    renderCanvas()
  }, [canvasReady, drawLineToMask, getCanvasPoint, renderCanvas, tool])

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return
    const point = getCanvasPoint(event)
    if (!point) return

    if (tool === 'rect') {
      const rect = drawingRectRef.current
      if (!rect) return
      rect.current = point
      renderCanvas()
      return
    }

    const erase = tool === 'eraser'
    const prev = lastPointRef.current ?? point
    drawLineToMask(prev, point, erase)
    lastPointRef.current = point
    renderCanvas()
  }, [drawLineToMask, getCanvasPoint, isDrawing, renderCanvas, tool])

  const onPointerUp = useCallback(() => {
    if (!isDrawing) return

    if (tool === 'rect' && drawingRectRef.current) {
      fillRectToMask(drawingRectRef.current.start, drawingRectRef.current.current)
      drawingRectRef.current = null
    }

    lastPointRef.current = null
    setIsDrawing(false)
    pushHistorySnapshot()
    renderCanvas()
  }, [fillRectToMask, isDrawing, pushHistorySnapshot, renderCanvas, tool])

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

  const onDownload = useCallback(() => {
    if (!file || !originalImageRef.current || !maskCanvasRef.current || !sourceCanvasRef.current) return

    const sourceWidth = sourceCanvasRef.current.width
    const sourceHeight = sourceCanvasRef.current.height
    if (sourceWidth <= 0 || sourceHeight <= 0) return

    const naturalWidth = originalImageRef.current.naturalWidth
    const naturalHeight = originalImageRef.current.naturalHeight
    if (naturalWidth <= 0 || naturalHeight <= 0) return

    const exportSource = createCanvas(naturalWidth, naturalHeight)
    const exportSourceCtx = exportSource.getContext('2d')
    if (!exportSourceCtx) return
    exportSourceCtx.drawImage(originalImageRef.current, 0, 0, naturalWidth, naturalHeight)

    const exportMosaic = createCanvas(naturalWidth, naturalHeight)
    const scaleRatio = Math.max(naturalWidth / sourceWidth, naturalHeight / sourceHeight, 1)
    const exportPixelSize = Math.max(2, Math.round(pixelSize * scaleRatio))
    buildMosaicLayer(exportSource, exportMosaic, exportPixelSize)

    const exportMask = createCanvas(naturalWidth, naturalHeight)
    const exportMaskCtx = exportMask.getContext('2d')
    if (!exportMaskCtx) return
    exportMaskCtx.drawImage(maskCanvasRef.current, 0, 0, naturalWidth, naturalHeight)

    const blended = createCanvas(naturalWidth, naturalHeight)
    const blendedCtx = blended.getContext('2d')
    if (!blendedCtx) return
    blendedCtx.drawImage(exportMosaic, 0, 0)
    blendedCtx.globalCompositeOperation = 'destination-in'
    blendedCtx.drawImage(exportMask, 0, 0)
    blendedCtx.globalCompositeOperation = 'source-over'

    const outputCanvas = createCanvas(naturalWidth, naturalHeight)
    const outputCtx = outputCanvas.getContext('2d')
    if (!outputCtx) return
    outputCtx.drawImage(exportSource, 0, 0)
    outputCtx.globalAlpha = clamp(strength, 0, 100) / 100
    outputCtx.drawImage(blended, 0, 0)
    outputCtx.globalAlpha = 1

    const outputMime = getOutputMime(file.type)
    const extension = outputMime === 'image/png' ? 'png' : outputMime === 'image/webp' ? 'webp' : 'jpg'
    outputCanvas.toBlob((blob) => {
      if (!blob) return
      const link = document.createElement('a')
      const objectUrl = URL.createObjectURL(blob)
      link.href = objectUrl
      link.download = `${stripExt(file.name)}-mosaic.${extension}`
      link.click()
      URL.revokeObjectURL(objectUrl)
    }, outputMime, outputMime === 'image/jpeg' ? 0.92 : undefined)
  }, [file, pixelSize, strength])

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

      const mosaicCanvas = createCanvas(width, height)
      const maskCanvas = createCanvas(width, height)
      const blendCanvas = createCanvas(width, height)

      sourceCanvasRef.current = sourceCanvas
      mosaicCanvasRef.current = mosaicCanvas
      maskCanvasRef.current = maskCanvas
      blendCanvasRef.current = blendCanvas

      const maskCtx = maskCanvas.getContext('2d')
      if (!maskCtx) return
      maskCtx.clearRect(0, 0, width, height)
      const blank = maskCtx.getImageData(0, 0, width, height)
      historyRef.current = [blank]
      historyIndexRef.current = 0
      syncHistoryMeta()

      setCanvasReady(true)
      setIsDrawing(false)
      drawingRectRef.current = null
      lastPointRef.current = null
      // Initial render is handled by the canvasReady/pixelSize effect below
    }
    image.src = inputPreviewUrl

    return () => {
      active = false
    }
  }, [inputPreviewUrl, syncHistoryMeta])

  // Rebuild mosaic layer only when pixel size or canvas readiness changes
  useEffect(() => {
    if (!canvasReady || !sourceCanvasRef.current || !mosaicCanvasRef.current) return
    buildMosaicLayer(sourceCanvasRef.current, mosaicCanvasRef.current, pixelSize)
  }, [canvasReady, pixelSize])

  // Re-render preview when any visual parameter changes
  useEffect(() => {
    if (!canvasReady) return
    renderCanvas()
  }, [canvasReady, pixelSize, strength, renderCanvas])

  const canUndo = historyMeta.index > 0
  const canRedo = historyMeta.index >= 0 && historyMeta.index < historyMeta.size - 1

  const toolButtons: Array<{ id: MosaicTool; icon: typeof Brush; label: string }> = [
    { id: 'rect', icon: RectangleHorizontal, label: t('mosaic.toolRect') },
    { id: 'brush', icon: Brush, label: t('mosaic.toolBrush') },
    { id: 'eraser', icon: Eraser, label: t('mosaic.toolEraser') },
  ]

  return (
    <>
      <SEOHead title={t('mosaic.seoTitle')} description={t('mosaic.seoDescription')} keywords={t('mosaic.seoKeywords')} canonicalPath="/image-tools/mosaic" jsonLd={[buildToolJsonLd({ name: t('mosaic.seoTitle'), description: t('mosaic.seoDescription'), url: '/image-tools/mosaic' }), buildBreadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: t('title'), path: '/image-tools' }, { name: t('mosaic.title'), path: '/image-tools/mosaic' }])]} />
      <ToolPageShell title={t('mosaic.title')} description={t('mosaic.description')} backTo="/image-tools" layout="workspace" width="wide">
        <div className="space-y-5">
          <ToolWorkspaceDropzone
            accept={{ 'image/*': [] }}
            multiple={false}
            maxFiles={1}
            onFiles={handleFiles}
            title={file ? undefined : t('mosaic.emptyHint')}
            hint={file ? undefined : t('mosaic.localHint')}
            className={file ? 'min-h-[10rem]' : 'min-h-[14rem]'}
          />

          {file ? (
            <div className="space-y-4 rounded-xl border border-border/70 bg-card/70 p-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">{t('mosaic.localHint')}</p>
                {fileInfo ? <p className="text-xs text-muted-foreground">{fileInfo}</p> : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {toolButtons.map((item) => {
                  const Icon = item.icon
                  const active = tool === item.id
                  return (
                    <Button
                      key={item.id}
                      type="button"
                      size="sm"
                      variant={active ? 'default' : 'outline'}
                      onClick={() => setTool(item.id)}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Button>
                  )
                })}

                <div className="mx-1 h-6 w-px bg-border/70" />

                <Button type="button" size="sm" variant="outline" onClick={onUndo} disabled={!canUndo} aria-label={t('mosaic.undo')}>
                  <Undo2 className="h-4 w-4" />
                  {t('mosaic.undo')}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={onRedo} disabled={!canRedo} aria-label={t('mosaic.redo')}>
                  <Redo2 className="h-4 w-4" />
                  {t('mosaic.redo')}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={resetMask} disabled={!canvasReady} aria-label={t('mosaic.reset')}>
                  <RotateCcw className="h-4 w-4" />
                  {t('mosaic.reset')}
                </Button>

                <div className="ml-auto">
                  <Button type="button" size="sm" onClick={onDownload} disabled={!canvasReady} aria-label={t('mosaic.download')}>
                    <Download className="h-4 w-4" />
                    {t('mosaic.download')}
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="mosaic-block-size" className="text-xs text-muted-foreground">{t('mosaic.pixelSizeLabel')}</Label>
                  <input
                    id="mosaic-block-size"
                    type="range"
                    min={2}
                    max={80}
                    step={1}
                    value={pixelSize}
                    onChange={(event) => setPixelSize(Number(event.target.value))}
                    className="w-full accent-primary"
                  />
                  <p className="text-xs font-medium tabular-nums">{pixelSize}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mosaic-brush-size" className="text-xs text-muted-foreground">{t('mosaic.brushSize')}</Label>
                  <input
                    id="mosaic-brush-size"
                    type="range"
                    min={4}
                    max={120}
                    step={1}
                    value={brushSize}
                    onChange={(event) => setBrushSize(Number(event.target.value))}
                    className="w-full accent-primary"
                  />
                  <p className="text-xs font-medium tabular-nums">{brushSize}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mosaic-strength" className="text-xs text-muted-foreground">{t('mosaic.strength')}</Label>
                  <input
                    id="mosaic-strength"
                    type="range"
                    min={20}
                    max={100}
                    step={1}
                    value={strength}
                    onChange={(event) => setStrength(Number(event.target.value))}
                    className="w-full accent-primary"
                  />
                  <p className="text-xs font-medium tabular-nums">{strength}%</p>
                </div>
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
                    aria-label={t('mosaic.title')}
                  />
                </div>
              </div>

              <p className="text-xs text-muted-foreground">{t('mosaic.dragHint')}</p>
            </div>
          ) : null}
        </div>
      </ToolPageShell>
    </>
  )
}
