import { useEffect, useMemo } from 'react'
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { ChevronDown, ChevronUp, GripVertical, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { usePdfThumbnails } from '@/hooks/usePdfThumbnails'
import { cn } from '@/lib/utils'

type Mode = 'select' | 'reorder'
type PageOperation = 'rotate' | 'delete' | 'extract' | 'reorder'

type Props = {
  file: File | null
  mode: Mode
  pageOperation?: PageOperation
  selectedPages: number[]
  reorderPages: number[]
  onSelectedPagesChange: (pages: number[]) => void
  onReorderPagesChange: (pages: number[]) => void
  onQuickApplyPage?: (pageNumber: number) => void
  onQuickApplySelectedPages?: (pages: number[]) => void
  quickApplyPending?: boolean
}

type ReorderItem = {
  id: string
  pageNumber: number
}

function toAscendingUnique(pages: number[]) {
  return [...new Set(pages)].sort((a, b) => a - b)
}

function moveInArray(items: number[], from: number, to: number) {
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

type SortableRowProps = {
  item: ReorderItem
  index: number
  total: number
  thumbnailDataUrl?: string
  pageLabel: string
  orderLabel: string
  onMoveUp: () => void
  onMoveDown: () => void
}

function SortablePageRow({
  item,
  index,
  total,
  thumbnailDataUrl,
  pageLabel,
  orderLabel,
  onMoveUp,
  onMoveDown,
}: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: transform
      ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`
      : undefined,
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 rounded-lg border border-border/70 bg-card p-2 transition-shadow',
        isDragging && 'shadow-lg ring-1 ring-primary/40',
      )}
    >
      <button
        type="button"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border bg-muted/50 text-muted-foreground hover:bg-muted"
        aria-label={orderLabel}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="w-8 text-center text-xs font-semibold text-muted-foreground">
        {orderLabel}
      </div>
      <div className="flex h-16 w-12 items-center justify-center overflow-hidden rounded border border-border/70 bg-muted/20">
        {thumbnailDataUrl ? (
          <img
            src={thumbnailDataUrl}
            alt={pageLabel}
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="text-[11px] font-medium text-muted-foreground">{item.pageNumber}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{pageLabel}</p>
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          disabled={index === 0}
          onClick={onMoveUp}
        >
          <ChevronUp className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          disabled={index === total - 1}
          onClick={onMoveDown}
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export function PdfPageWorkspace({
  file,
  mode,
  pageOperation = 'extract',
  selectedPages,
  reorderPages,
  onSelectedPagesChange,
  onReorderPagesChange,
  onQuickApplyPage,
  onQuickApplySelectedPages,
  quickApplyPending = false,
}: Props) {
  const { t } = useTranslation('tools')
  const { thumbnails, totalPages, renderedPages, loading, error } = usePdfThumbnails(file, {
    maxPages: 100,
    thumbnailWidth: 184,
  })

  const visiblePages = useMemo(() => thumbnails.map((item) => item.pageNumber), [thumbnails])
  const selectedSet = useMemo(() => new Set(selectedPages), [selectedPages])
  const thumbnailMap = useMemo(() => new Map(thumbnails.map((item) => [item.pageNumber, item])), [thumbnails])
  const effectiveOrder = useMemo(
    () => (reorderPages.length > 0 ? reorderPages : visiblePages),
    [reorderPages, visiblePages],
  )
  const reorderItems = useMemo<ReorderItem[]>(
    () =>
      effectiveOrder.map((pageNumber, index) => ({
        id: `${index}:${pageNumber}`,
        pageNumber,
      })),
    [effectiveOrder],
  )
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )
  const quickActionLabel = useMemo(() => {
    if (!onQuickApplyPage || mode !== 'select') return null
    if (pageOperation === 'delete') return t('pdf.workspace.quickDelete')
    if (pageOperation === 'rotate') return t('pdf.workspace.quickRotate')
    if (pageOperation === 'extract') return t('pdf.workspace.quickExtract')
    return null
  }, [mode, onQuickApplyPage, pageOperation, t])
  const quickSelectedActionLabel = useMemo(() => {
    if (!onQuickApplySelectedPages || mode !== 'select') return null
    if (pageOperation === 'delete') return t('pdf.workspace.quickDeleteSelected')
    if (pageOperation === 'rotate') return t('pdf.workspace.quickRotateSelected')
    if (pageOperation === 'extract') return t('pdf.workspace.quickExtractSelected')
    return null
  }, [mode, onQuickApplySelectedPages, pageOperation, t])
  const quickActionVariant = pageOperation === 'delete' ? 'destructive' : 'secondary'

  useEffect(() => {
    if (mode !== 'reorder') return
    if (reorderPages.length > 0) return
    if (visiblePages.length === 0) return
    onReorderPagesChange(visiblePages)
  }, [mode, onReorderPagesChange, reorderPages.length, visiblePages])

  if (!file) return null

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-muted/10 p-3 sm:p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">{t('pdf.workspace.visualTitle')}</p>
        <p className="text-xs text-muted-foreground">{t('pdf.workspace.visualHint')}</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('pdf.workspace.loadingPages')}
        </div>
      ) : null}
      {error ? <p className="text-xs text-destructive">{t('pdf.workspace.renderFailed')}</p> : null}
      {totalPages > renderedPages && renderedPages > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t('pdf.workspace.renderLimited', { rendered: renderedPages, total: totalPages })}
        </p>
      ) : null}

      {mode === 'select' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onSelectedPagesChange(visiblePages)}>
              {t('pdf.workspace.selectAllVisible')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => onSelectedPagesChange([])}>
              {t('pdf.workspace.clearSelected')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                onSelectedPagesChange(
                  toAscendingUnique(
                    visiblePages.filter((pageNumber) => !selectedSet.has(pageNumber)),
                  ),
                )
              }
            >
              {t('pdf.workspace.invertSelected')}
            </Button>
            {quickSelectedActionLabel ? (
              <Button
                type="button"
                size="sm"
                variant={quickActionVariant}
                disabled={quickApplyPending || selectedPages.length === 0}
                onClick={() => onQuickApplySelectedPages?.(selectedPages)}
              >
                {quickSelectedActionLabel}
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{t('pdf.workspace.selectedCount', { count: selectedPages.length })}</p>

          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {thumbnails.map((item) => {
              const active = selectedSet.has(item.pageNumber)
              return (
                <div
                  key={item.pageNumber}
                  className={cn(
                    'space-y-2 rounded-lg border p-2 transition-colors',
                    active ? 'border-primary bg-primary/5' : 'border-border/70 hover:bg-muted/40',
                  )}
                >
                  <button
                    type="button"
                    className="w-full space-y-2 text-left"
                    onClick={() => {
                      if (active) {
                        onSelectedPagesChange(toAscendingUnique(selectedPages.filter((page) => page !== item.pageNumber)))
                      } else {
                        onSelectedPagesChange(toAscendingUnique([...selectedPages, item.pageNumber]))
                      }
                    }}
                  >
                    <div className="overflow-hidden rounded-md border border-border/70 bg-card">
                      <img src={item.dataUrl} alt={t('pdf.workspace.pageLabel', { page: item.pageNumber })} className="h-28 w-full object-contain" />
                    </div>
                    <p className="text-xs font-medium">{t('pdf.workspace.pageLabel', { page: item.pageNumber })}</p>
                  </button>
                  {quickActionLabel ? (
                    <Button
                      type="button"
                      size="sm"
                      variant={quickActionVariant}
                      className="h-7 w-full text-xs"
                      disabled={quickApplyPending}
                      onClick={() => onQuickApplyPage?.(item.pageNumber)}
                    >
                      {quickActionLabel}
                    </Button>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onReorderPagesChange(visiblePages)}>
              {t('pdf.workspace.reorderReset')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => onReorderPagesChange([...effectiveOrder].reverse())}>
              {t('pdf.workspace.reorderReverse')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('pdf.workspace.reorderHint')}</p>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(event: DragEndEvent) => {
              const { active, over } = event
              if (!over || active.id === over.id) return
              const fromIndex = reorderItems.findIndex((item) => item.id === active.id)
              const toIndex = reorderItems.findIndex((item) => item.id === over.id)
              if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return
              onReorderPagesChange(arrayMove(effectiveOrder, fromIndex, toIndex))
            }}
          >
            <SortableContext items={reorderItems.map((item) => item.id)} strategy={verticalListSortingStrategy}>
              <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                {reorderItems.map((item, index) => (
                  <SortablePageRow
                    key={item.id}
                    item={item}
                    index={index}
                    total={reorderItems.length}
                    thumbnailDataUrl={thumbnailMap.get(item.pageNumber)?.dataUrl}
                    pageLabel={t('pdf.workspace.pageLabel', { page: item.pageNumber })}
                    orderLabel={t('pdf.workspace.orderLabel', { index: index + 1 })}
                    onMoveUp={() => onReorderPagesChange(moveInArray(effectiveOrder, index, index - 1))}
                    onMoveDown={() => onReorderPagesChange(moveInArray(effectiveOrder, index, index + 1))}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  )
}
