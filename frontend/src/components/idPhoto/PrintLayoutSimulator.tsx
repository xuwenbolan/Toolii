import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

const MM_PER_INCH = 25.4
const PAPER_W_INCH = 6
const PAPER_H_INCH = 4

type Props = {
  previewDataUrl: string
  photoWidthMm: number
  photoHeightMm: number
  className?: string
}

export function PrintLayoutSimulator({ previewDataUrl, photoWidthMm, photoHeightMm, className }: Props) {
  const { t } = useTranslation('idPhoto')

  const { cols, rows, total } = useMemo(() => {
    const paperW = PAPER_W_INCH * MM_PER_INCH
    const paperH = PAPER_H_INCH * MM_PER_INCH
    const c = Math.max(1, Math.floor(paperW / photoWidthMm))
    const r = Math.max(1, Math.floor(paperH / photoHeightMm))
    return { cols: c, rows: r, total: c * r }
  }, [photoWidthMm, photoHeightMm])

  return (
    <div className={cn('space-y-2', className)}>
      <div
        className="relative mx-auto overflow-hidden rounded-md border bg-white shadow-sm"
        style={{ aspectRatio: `${PAPER_W_INCH} / ${PAPER_H_INCH}` }}
      >
        {/* Photo grid */}
        <div
          className="grid h-full w-full place-items-center p-[2%]"
          style={{
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
            gap: '2px',
          }}
        >
          {Array.from({ length: total }, (_, i) => (
            <img
              key={i}
              src={previewDataUrl}
              alt=""
              className="h-full w-full object-contain"
              draggable={false}
            />
          ))}
        </div>

        {/* Watermark overlay */}
        <div
          className="pointer-events-none absolute inset-[-50%] select-none"
          style={{ transform: 'rotate(-30deg)' }}
          aria-hidden="true"
        >
          <div className="grid h-full w-full grid-cols-4 grid-rows-6 items-center justify-items-center">
            {Array.from({ length: 24 }, (_, i) => (
              <span
                key={i}
                className="text-lg font-bold tracking-[0.25em] text-black/[0.07]"
              >
                Toolii
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        {t('layoutSim.info', {
          paper: `${PAPER_W_INCH}x${PAPER_H_INCH}"`,
          rows,
          cols,
          total,
        })}
      </p>
    </div>
  )
}
