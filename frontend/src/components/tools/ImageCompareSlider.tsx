import { type PointerEvent, useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

type Props = {
  beforeUrl?: string | null
  afterUrl?: string | null
  beforeAlt: string
  afterAlt: string
  beforeMeta?: string
  afterMeta?: string
  className?: string
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function ImageCompareSlider({
  beforeUrl,
  afterUrl,
  beforeAlt,
  afterAlt,
  beforeMeta,
  afterMeta,
  className,
}: Props) {
  const { t } = useTranslation('common')
  const [position, setPosition] = useState(50)
  const [dragging, setDragging] = useState(false)
  const frameRef = useRef<HTMLDivElement | null>(null)

  const updateByClientX = useCallback((clientX: number) => {
    const frame = frameRef.current
    if (!frame) return
    const rect = frame.getBoundingClientRect()
    if (rect.width <= 0) return
    const next = ((clientX - rect.left) / rect.width) * 100
    setPosition(clamp(next, 0, 100))
  }, [])

  const handlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    setDragging(true)
    updateByClientX(event.clientX)
  }, [updateByClientX])

  const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    updateByClientX(event.clientX)
  }, [dragging, updateByClientX])

  const handlePointerUp = useCallback(() => {
    setDragging(false)
  }, [])

  return (
    <section className={cn('space-y-3', className)}>
      <div
        ref={frameRef}
        className="relative overflow-hidden rounded-xl border border-border/70 bg-muted/20 select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="flex min-h-[17rem] items-center justify-center p-3 sm:min-h-[22rem]">
          {afterUrl ? (
            <img
              src={afterUrl}
              alt={afterAlt}
              className="h-full max-h-[62vh] w-full rounded-md object-contain motion-safe:animate-fade-in"
              loading="lazy"
              draggable={false}
            />
          ) : null}
          {beforeUrl ? (
            <img
              src={beforeUrl}
              alt={beforeAlt}
              className="pointer-events-none absolute inset-3 h-[calc(100%-1.5rem)] w-[calc(100%-1.5rem)] rounded-md object-contain"
              style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
              loading="lazy"
              draggable={false}
            />
          ) : null}
        </div>

        <div
          className="pointer-events-none absolute inset-y-0"
          style={{ left: `${position}%` }}
          aria-hidden="true"
        >
          <div className="h-full w-0.5 -translate-x-1/2 bg-white/95 shadow-[0_0_0_1px_rgba(0,0,0,0.18)]" />
          <div className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-background shadow-md transition-[box-shadow] duration-[var(--duration-fast)] hover:shadow-lg" />
        </div>

        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-end justify-between text-xs">
          <span className="rounded-md bg-black/60 px-2 py-1 text-white">
            {t('preview.before')}
            {beforeMeta ? ` · ${beforeMeta}` : ''}
          </span>
          <span className="rounded-md bg-black/60 px-2 py-1 text-white">
            {t('preview.after')}
            {afterMeta ? ` · ${afterMeta}` : ''}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">{t('preview.before')}</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={position}
          onChange={(event) => setPosition(Number(event.target.value))}
          className="w-full accent-primary"
          aria-label={t('preview.compareSliderLabel')}
        />
        <span className="text-xs text-muted-foreground">{t('preview.after')}</span>
      </div>
    </section>
  )
}
