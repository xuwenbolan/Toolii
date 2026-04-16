import { useTranslation } from 'react-i18next'
import { Minus, Plus, RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'

type Props = {
  zoom: number
  onZoomChange: (zoom: number) => void
  currentPage?: number
  totalPages?: number
}

const ZOOM_STEP = 25
const ZOOM_MIN = 25
const ZOOM_MAX = 300

export function PreviewToolbar({ zoom, onZoomChange, currentPage, totalPages }: Props) {
  const { t } = useTranslation('tools')

  const showPageIndicator = currentPage != null && totalPages != null && totalPages > 0

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 rounded-full bg-card/90 backdrop-blur-md border border-border/60 shadow-md px-2 py-1 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300">
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 rounded-full"
        disabled={zoom <= ZOOM_MIN}
        onClick={() => onZoomChange(Math.max(ZOOM_MIN, zoom - ZOOM_STEP))}
        aria-label={t('docx.preview.zoomOut')}
      >
        <Minus className="h-3 w-3" />
      </Button>

      <span className="text-[11px] font-medium text-muted-foreground min-w-[2.5rem] text-center tabular-nums select-none">
        {zoom}%
      </span>

      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 rounded-full"
        disabled={zoom >= ZOOM_MAX}
        onClick={() => onZoomChange(Math.min(ZOOM_MAX, zoom + ZOOM_STEP))}
        aria-label={t('docx.preview.zoomIn')}
      >
        <Plus className="h-3 w-3" />
      </Button>

      {zoom !== 100 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 rounded-full"
          onClick={() => onZoomChange(100)}
          aria-label={t('docx.preview.fitWidth')}
        >
          <RotateCcw className="h-2.5 w-2.5" />
        </Button>
      )}

      {showPageIndicator && (
        <>
          <div className="h-3.5 w-px bg-border/60 mx-0.5" />
          <span className="text-[11px] text-muted-foreground tabular-nums select-none px-1">
            {t('docx.preview.pageIndicator', { current: currentPage, total: totalPages })}
          </span>
        </>
      )}
    </div>
  )
}
