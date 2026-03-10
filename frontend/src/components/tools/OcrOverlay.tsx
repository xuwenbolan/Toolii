import { useCallback, useEffect, useRef, useState } from 'react'

import type { OcrLine } from '@/services/imageApi'

type Props = {
  imageUrl: string
  lines: OcrLine[]
  activeIndex: number | null
  onHoverIndex: (index: number | null) => void
}

/**
 * Renders an image with SVG polygon overlays for each OCR-detected text region.
 * Highlights the active line on hover with bidirectional linking.
 */
export function OcrOverlay({ imageUrl, lines, activeIndex, onHoverIndex }: Props) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null)

  const handleImageLoad = useCallback(() => {
    const img = imgRef.current
    if (!img) return
    setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
  }, [])

  // Reset natural size when image changes
  useEffect(() => {
    setNaturalSize(null)
  }, [imageUrl])

  return (
    <div className="relative inline-block w-full">
      <img
        ref={imgRef}
        src={imageUrl}
        alt=""
        className="block max-h-[60vh] w-full rounded-md object-contain"
        onLoad={handleImageLoad}
        draggable={false}
      />
      {naturalSize && lines.length > 0 && (
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${naturalSize.w} ${naturalSize.h}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {lines.map((line, i) => {
            if (!line.box || line.box.length < 4) return null
            const points = line.box.map((p) => `${p[0]},${p[1]}`).join(' ')
            const isActive = activeIndex === i
            return (
              <polygon
                key={i}
                points={points}
                className="pointer-events-auto cursor-pointer"
                fill={isActive ? 'var(--canvas-primary-fill)' : 'transparent'}
                stroke={isActive ? 'var(--canvas-primary-stroke)' : 'var(--canvas-primary-stroke-dim)'}
                strokeWidth={isActive ? 2.5 : 1.5}
                onPointerEnter={() => onHoverIndex(i)}
                onPointerLeave={() => onHoverIndex(null)}
              />
            )
          })}
        </svg>
      )}
    </div>
  )
}
