import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { canvasColor } from '@/lib/canvasColors'

export type Region = { x: number; y: number; w: number; h: number }

type Props = {
  imageUrl: string
  regions: Region[]
  onChange: (regions: Region[]) => void
}

const isCoarsePointer = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

export function RegionSelector({ imageUrl, regions, onChange }: Props) {
  const { t } = useTranslation('tools')
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [drawing, setDrawing] = useState(false)
  const [start, setStart] = useState<{ x: number; y: number } | null>(null)
  const [current, setCurrent] = useState<{ x: number; y: number } | null>(null)

  const getRelativePos = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas) return null
      const rect = canvas.getBoundingClientRect()
      const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
      return { x, y }
    },
    [],
  )

  // Draw regions and in-progress selection
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw existing regions
    for (let i = 0; i < regions.length; i++) {
      const r = regions[i]
      const rx = r.x * canvas.width
      const ry = r.y * canvas.height
      const rw = r.w * canvas.width
      const rh = r.h * canvas.height

      ctx.fillStyle = canvasColor('canvas-primary', 0.2)
      ctx.fillRect(rx, ry, rw, rh)
      ctx.strokeStyle = canvasColor('canvas-primary', 0.8)
      ctx.lineWidth = 2
      ctx.strokeRect(rx, ry, rw, rh)

      // Region number label
      ctx.fillStyle = canvasColor('canvas-primary', 0.9)
      const labelSize = 20
      ctx.fillRect(rx, ry, labelSize, labelSize)
      ctx.fillStyle = '#ffffff'
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(i + 1), rx + labelSize / 2, ry + labelSize / 2)

      // Delete button (top-right corner, larger on touch devices)
      const btnSize = isCoarsePointer ? 26 : 18
      const btnX = rx + rw - btnSize
      const btnY = ry
      ctx.fillStyle = canvasColor('canvas-score-poor', 0.9)
      ctx.fillRect(btnX, btnY, btnSize, btnSize)
      ctx.fillStyle = '#ffffff'
      ctx.font = `${isCoarsePointer ? 18 : 13}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('\u00d7', btnX + btnSize / 2, btnY + btnSize / 2)
    }

    // Draw in-progress selection
    if (drawing && start && current) {
      const sx = Math.min(start.x, current.x) * canvas.width
      const sy = Math.min(start.y, current.y) * canvas.height
      const sw = Math.abs(current.x - start.x) * canvas.width
      const sh = Math.abs(current.y - start.y) * canvas.height

      ctx.fillStyle = canvasColor('canvas-score-high', 0.15)
      ctx.fillRect(sx, sy, sw, sh)
      ctx.strokeStyle = canvasColor('canvas-score-high', 0.8)
      ctx.lineWidth = 2
      ctx.setLineDash([5, 3])
      ctx.strokeRect(sx, sy, sw, sh)
      ctx.setLineDash([])
    }
  }, [regions, drawing, start, current])

  // Sync canvas size to container
  useEffect(() => {
    const img = imgRef.current
    const canvas = canvasRef.current
    if (!img || !canvas || !imgLoaded) return

    const resizeCanvas = () => {
      canvas.width = img.clientWidth
      canvas.height = img.clientHeight
      draw()
    }

    resizeCanvas()
    const observer = new ResizeObserver(resizeCanvas)
    observer.observe(img)
    return () => observer.disconnect()
  }, [imgLoaded, draw])

  useEffect(() => {
    draw()
  }, [draw])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const pos = getRelativePos(e.clientX, e.clientY)
      if (!pos) return

      // Check if clicking a delete button (expanded hit area on touch)
      const canvas = canvasRef.current
      if (canvas) {
        const btnSize = isCoarsePointer ? 26 : 18
        const hitPad = isCoarsePointer ? 8 : 0
        for (let i = regions.length - 1; i >= 0; i--) {
          const r = regions[i]
          const btnX = (r.x + r.w) * canvas.width - btnSize
          const btnY = r.y * canvas.height
          const cx = pos.x * canvas.width
          const cy = pos.y * canvas.height
          if (cx >= btnX - hitPad && cx <= btnX + btnSize + hitPad && cy >= btnY - hitPad && cy <= btnY + btnSize + hitPad) {
            onChange(regions.filter((_, idx) => idx !== i))
            return
          }
        }
      }

      setDrawing(true)
      setStart(pos)
      setCurrent(pos)
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [getRelativePos, regions, onChange],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drawing) return
      const pos = getRelativePos(e.clientX, e.clientY)
      if (pos) setCurrent(pos)
    },
    [drawing, getRelativePos],
  )

  const handlePointerUp = useCallback(() => {
    if (!drawing || !start || !current) {
      setDrawing(false)
      return
    }

    const x = Math.min(start.x, current.x)
    const y = Math.min(start.y, current.y)
    const w = Math.abs(current.x - start.x)
    const h = Math.abs(current.y - start.y)

    // Ignore tiny regions (accidental clicks)
    if (w > 0.01 && h > 0.01) {
      onChange([...regions, { x, y, w, h }])
    }

    setDrawing(false)
    setStart(null)
    setCurrent(null)
  }, [drawing, start, current, regions, onChange])

  return (
    <div className="space-y-2">
      <div
        ref={containerRef}
        className="relative inline-block w-full select-none"
        style={{ touchAction: 'none' }}
      >
        <img
          ref={imgRef}
          src={imageUrl}
          alt=""
          className="block w-full rounded-md"
          onLoad={() => setImgLoaded(true)}
          draggable={false}
        />
        {imgLoaded && (
          <canvas
            ref={canvasRef}
            className="absolute left-0 top-0 h-full w-full cursor-crosshair rounded-md"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {regions.length > 0
            ? t('mosaic.regionCount', { count: regions.length })
            : t('mosaic.addRegionHint')}
        </p>
        {regions.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => onChange([])}>
            {t('mosaic.clearRegions')}
          </Button>
        )}
      </div>
    </div>
  )
}
