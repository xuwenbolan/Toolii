import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
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
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { FileText, GripVertical, ImageIcon, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useObjectUrl } from '@/hooks/useObjectUrl'
import { formatBytes } from '@/lib/fileValidation'
import { cn } from '@/lib/utils'

const FILE_ID_MAP = new WeakMap<File, string>()

function getFileId(file: File): string {
  const existing = FILE_ID_MAP.get(file)
  if (existing) return existing

  const fallback = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : fallback
  FILE_ID_MAP.set(file, id)
  return id
}

type FileKind = 'pdf' | 'image'

type Props = {
  files: File[]
  kind: FileKind
  hint?: string
  onReorder: (nextFiles: File[]) => void
  onRemove?: (index: number) => void
}

type SortableItem = {
  id: string
  file: File
  index: number
}

type RowProps = {
  item: SortableItem
  onRemove?: (index: number) => void
}

function SortablePdfRow({ item, onRemove }: RowProps) {
  const { t } = useTranslation('tools')

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
        'rounded-md border bg-card p-2 transition-shadow',
        isDragging && 'shadow-lg ring-1 ring-primary/40',
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border bg-muted/50 text-muted-foreground hover:bg-muted"
          aria-label={t('shared.dragHandle')}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="h-10 w-10 shrink-0 overflow-hidden rounded border bg-muted/40">
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <FileText className="h-4 w-4" aria-hidden="true" />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.index + 1}. {item.file.name}</p>
          <p className="text-xs text-muted-foreground">{formatBytes(item.file.size)}</p>
        </div>

        {onRemove ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            onClick={() => onRemove(item.index)}
            aria-label={t('shared.remove')}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function SortableImageCard({ item, onRemove }: RowProps) {
  const { t } = useTranslation('tools')
  const previewUrl = useObjectUrl(item.file)
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
        'relative overflow-hidden rounded-lg border bg-card p-2 transition-shadow',
        isDragging && 'shadow-lg ring-1 ring-primary/40',
      )}
    >
      <button
        type="button"
        className="absolute left-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded border bg-background/90 text-muted-foreground backdrop-blur hover:bg-muted"
        aria-label={t('shared.dragHandle')}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>

      {onRemove ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="absolute right-2 top-2 z-10 h-7 w-7 rounded border bg-background/90 backdrop-blur hover:bg-muted"
          onClick={() => onRemove(item.index)}
          aria-label={t('shared.remove')}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      ) : null}

      <div className="overflow-hidden rounded-md border bg-muted/20">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={item.file.name}
            className="h-36 w-full object-cover sm:h-40"
            loading="lazy"
          />
        ) : (
          <div className="flex h-36 w-full items-center justify-center text-muted-foreground sm:h-40">
            <ImageIcon className="h-5 w-5" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="mt-2 min-w-0 space-y-0.5">
        <p className="truncate text-sm font-medium">{item.index + 1}. {item.file.name}</p>
        <p className="text-xs text-muted-foreground">{formatBytes(item.file.size)}</p>
      </div>
    </div>
  )
}

export function SortableFileList({ files, kind, hint, onReorder, onRemove }: Props) {
  const { t } = useTranslation('tools')

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const items = useMemo<SortableItem[]>(
    () => files.map((file, index) => ({ id: getFileId(file), file, index })),
    [files],
  )

  if (items.length === 0) return null

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const fromIndex = items.findIndex((item) => item.id === active.id)
    const toIndex = items.findIndex((item) => item.id === over.id)
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return

    onReorder(arrayMove(files, fromIndex, toIndex))
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{hint ?? t('shared.dragToSort')}</p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        {kind === 'image' ? (
          <SortableContext items={items.map((item) => item.id)} strategy={rectSortingStrategy}>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => (
                <SortableImageCard
                  key={item.id}
                  item={item}
                  onRemove={onRemove}
                />
              ))}
            </div>
          </SortableContext>
        ) : (
          <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {items.map((item) => (
                <SortablePdfRow
                  key={item.id}
                  item={item}
                  onRemove={onRemove}
                />
              ))}
            </div>
          </SortableContext>
        )}
      </DndContext>
    </div>
  )
}
