import { RotateCw, Trash2, ZoomIn } from 'lucide-react'

import { cn } from '@/lib/utils'

type Props = {
  pageIndex: number
  thumbnailUrl: string | undefined
  rotation: number
  selected: boolean
  loading?: boolean
  onToggleSelect: (shiftKey: boolean) => void
  onRotate: () => void
  onDelete: () => void
  onPreview?: () => void
}

const isCoarsePointer = () => window.matchMedia('(pointer: coarse)').matches

export function PdfPageCard({
  pageIndex,
  thumbnailUrl,
  rotation,
  selected,
  loading,
  onToggleSelect,
  onRotate,
  onDelete,
  onPreview,
}: Props) {
  const handleCardClick = (e: React.MouseEvent) => {
    // Touch devices: card tap opens preview
    if (onPreview && isCoarsePointer()) {
      onPreview()
      return
    }
    // Desktop: card click toggles selection
    onToggleSelect(e.shiftKey)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        'group relative cursor-pointer select-none rounded-lg border-2 bg-white duration-150 hover-lift-sm',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        selected
          ? 'border-primary shadow-md shadow-primary/10 ring-1 ring-primary/30'
          : 'border-transparent shadow-sm',
      )}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          if (onPreview) onPreview()
          else onToggleSelect(e.shiftKey)
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          onDelete()
        }
      }}
    >
      {/* Selection circle: always visible on mobile, hover-visible on desktop */}
      <div
        className={cn(
          'absolute left-1.5 top-1.5 z-10 flex h-7 w-7 sm:h-5 sm:w-5 items-center justify-center rounded-full transition-all',
          selected
            ? 'bg-primary text-[10px] font-bold text-primary-foreground shadow-sm'
            : 'border border-white/70 bg-black/15 sm:opacity-0 sm:group-hover:opacity-100',
        )}
        onClick={(e) => {
          e.stopPropagation()
          onToggleSelect(e.shiftKey)
        }}
      >
        {selected && <>&#10003;</>}
      </div>

      {/* Thumbnail */}
      <div className="relative flex aspect-[3/4] items-center justify-center overflow-hidden rounded-t-md bg-muted/30 p-1">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={`Page ${pageIndex + 1}`}
            className="h-full w-full rounded object-contain transition-transform duration-200"
            style={{ transform: rotation ? `rotate(${rotation}deg)` : undefined }}
            loading="lazy"
            draggable={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {loading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
            ) : (
              <div className="text-xs text-muted-foreground/50">PDF</div>
            )}
          </div>
        )}

        {/* Desktop: zoom overlay on hover */}
        {onPreview && thumbnailUrl && (
          <div className="pointer-events-none absolute inset-0 hidden items-center justify-center opacity-0 transition-all group-hover:pointer-events-auto group-hover:bg-black/20 group-hover:opacity-100 sm:flex">
            <button
              type="button"
              className="rounded-full bg-white/90 p-2 shadow-md transition-transform hover:scale-110"
              onClick={(e) => {
                e.stopPropagation()
                onPreview()
              }}
            >
              <ZoomIn className="h-4 w-4 text-foreground" />
            </button>
          </div>
        )}
      </div>

      {/* Page number + hover actions */}
      <div className="flex items-center justify-between px-2 py-1.5">
        <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
          {pageIndex + 1}
        </span>
        <div className="flex gap-0.5 sm:opacity-0 transition-opacity sm:group-hover:opacity-100">
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation()
              onRotate()
            }}
            title="Rotate 90°"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
