import { useCallback, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { useTranslation } from 'react-i18next'

export type PhotoAdjustControl = {
  offsetX: number
  offsetY: number
  scale: number
}

type GuideOverlay = {
  topMarginRatio: number
  faceHeightRatio: number
}

type Props = {
  src: string
  title?: string
  subtitle?: string
  guide?: GuideOverlay
  adjust?: PhotoAdjustControl
  onAdjustChange?: (next: PhotoAdjustControl) => void
  onAdjustCommit?: (next: PhotoAdjustControl) => void
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function normalizeAdjust(adjust: PhotoAdjustControl): PhotoAdjustControl {
  return {
    offsetX: clamp(adjust.offsetX, -0.45, 0.45),
    offsetY: clamp(adjust.offsetY, -0.45, 0.45),
    scale: clamp(adjust.scale, 0.75, 2.4),
  }
}

function pointerDistance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function PhotoPreview({
  src,
  title,
  subtitle,
  guide,
  adjust,
  onAdjustChange,
  onAdjustCommit,
}: Props) {
  const { t } = useTranslation('idPhoto')
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{
    startX: number
    startY: number
    startOffsetX: number
    startOffsetY: number
    latest: PhotoAdjustControl
  } | null>(null)

  // Multi-touch pinch-to-zoom tracking
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinchRef = useRef<{ initialDist: number; initialScale: number } | null>(null)

  const topLine = guide ? clamp(guide.topMarginRatio * 100, 6, 82) : null
  const chinLine = guide ? clamp((guide.topMarginRatio + guide.faceHeightRatio) * 100, 16, 92) : null
  const interactionEnabled = Boolean(adjust && onAdjustChange)

  const emitAdjust = useCallback((next: PhotoAdjustControl, commit: boolean) => {
    const normalized = normalizeAdjust(next)
    onAdjustChange?.(normalized)
    if (commit) onAdjustCommit?.(normalized)
  }, [onAdjustChange, onAdjustCommit])

  const handlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!interactionEnabled || !adjust) return
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    // Two fingers down: start pinch, cancel any drag
    if (pointersRef.current.size === 2) {
      dragRef.current = null
      setDragging(false)
      const pts = [...pointersRef.current.values()]
      pinchRef.current = {
        initialDist: pointerDistance(pts[0], pts[1]),
        initialScale: adjust.scale,
      }
      return
    }

    // Single finger: start drag
    if (pointersRef.current.size === 1) {
      dragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        startOffsetX: adjust.offsetX,
        startOffsetY: adjust.offsetY,
        latest: adjust,
      }
      setDragging(true)
    }
  }, [adjust, interactionEnabled])

  const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!interactionEnabled || !adjust) return
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    // Pinch-to-zoom with two fingers
    if (pinchRef.current && pointersRef.current.size === 2) {
      const pts = [...pointersRef.current.values()]
      const currentDist = pointerDistance(pts[0], pts[1])
      const ratio = currentDist / pinchRef.current.initialDist
      const next = normalizeAdjust({
        offsetX: adjust.offsetX,
        offsetY: adjust.offsetY,
        scale: pinchRef.current.initialScale * ratio,
      })
      onAdjustChange?.(next)
      return
    }

    // Single finger drag
    if (!dragRef.current) return
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return

    const dx = event.clientX - dragRef.current.startX
    const dy = event.clientY - dragRef.current.startY
    const next = normalizeAdjust({
      offsetX: dragRef.current.startOffsetX + (dx / rect.width) * 0.9,
      offsetY: dragRef.current.startOffsetY + (dy / rect.height) * 0.9,
      scale: adjust.scale,
    })
    dragRef.current.latest = next
    onAdjustChange?.(next)
  }, [adjust, interactionEnabled, onAdjustChange])

  const handlePointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!interactionEnabled) return
    pointersRef.current.delete(event.pointerId)

    // End pinch
    if (pinchRef.current) {
      if (pointersRef.current.size < 2) {
        pinchRef.current = null
        if (adjust) onAdjustCommit?.(adjust)
      }
      return
    }

    // End drag
    if (!dragRef.current) return
    setDragging(false)
    const latest = dragRef.current.latest
    dragRef.current = null
    onAdjustCommit?.(latest)
  }, [adjust, interactionEnabled, onAdjustCommit])

  const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    if (!interactionEnabled || !adjust) return
    event.preventDefault()
    const next = normalizeAdjust({
      ...adjust,
      scale: adjust.scale + (event.deltaY > 0 ? -0.045 : 0.045),
    })
    emitAdjust(next, true)
  }, [adjust, emitAdjust, interactionEnabled])

  const transform = adjust
    ? `translate(${adjust.offsetX * 42}%, ${adjust.offsetY * 42}%) scale(${adjust.scale})`
    : undefined

  return (
    <div className="space-y-2 rounded-xl border p-3">
      <div>
        <h3 className="text-sm font-semibold">{title ?? t('preview.watermarkAlt')}</h3>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 p-3">
        <div
          className={[
            'relative mx-auto w-fit overflow-hidden rounded-md border bg-white shadow-sm',
            interactionEnabled ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : '',
          ].join(' ')}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onLostPointerCapture={handlePointerUp}
          onWheel={handleWheel}
          style={interactionEnabled ? { touchAction: 'none' } : undefined}
        >
          <img
            src={src}
            alt={t('preview.title')}
            className="block max-h-[420px] w-auto select-none"
            draggable={false}
            style={
              transform
                ? {
                  transform,
                  transformOrigin: '50% 50%',
                  transition: dragging ? 'none' : 'transform 120ms cubic-bezier(0.16,1,0.3,1)',
                }
                : undefined
            }
          />

          {guide && topLine != null && chinLine != null ? (
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-x-[16%] inset-y-[8%] rounded-[6px] border-2 border-dashed border-white/85 shadow-[0_0_0_1px_rgba(15,23,42,0.35)]" />
              <div
                className="absolute left-[16%] right-[16%] border-t border-white/90 shadow-[0_0_0_1px_rgba(15,23,42,0.24)]"
                style={{ top: `${topLine}%` }}
              />
              <div
                className="absolute left-[16%] right-[16%] border-t border-white/90 shadow-[0_0_0_1px_rgba(15,23,42,0.24)]"
                style={{ top: `${chinLine}%` }}
              />
              <div
                className="absolute left-[16%] h-2 w-px bg-white/90 shadow-[0_0_0_1px_rgba(15,23,42,0.24)]"
                style={{ top: `${chinLine - 1}%` }}
              />
              <div
                className="absolute right-[16%] h-2 w-px bg-white/90 shadow-[0_0_0_1px_rgba(15,23,42,0.24)]"
                style={{ top: `${chinLine - 1}%` }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
