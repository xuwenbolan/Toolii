import { memo } from 'react'
import { AlertTriangle, FileText, GripVertical, X } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import type { DocxFileEntry } from '@/hooks/useDocxWorkspace'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = {
  entries: DocxFileEntry[]
  activeId: string | null
  isMergeMode?: boolean
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onReorder: (fromIndex: number, toIndex: number) => void
  onAddFiles: (files: File[]) => void
}

export function DocxFileList({ entries, activeId, isMergeMode, onSelect, onRemove, onReorder }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const fromIndex = entries.findIndex((e) => e.id === active.id)
    const toIndex = entries.findIndex((e) => e.id === over.id)
    if (fromIndex !== -1 && toIndex !== -1) {
      onReorder(fromIndex, toIndex)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={entries.map((e) => e.id)} strategy={verticalListSortingStrategy}>
          {entries.map((entry, index) => (
            <SortableFileCard
              key={entry.id}
              entry={entry}
              isActive={entry.id === activeId}
              orderIndex={isMergeMode ? index + 1 : undefined}
              onSelect={() => onSelect(entry.id)}
              onRemove={() => onRemove(entry.id)}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  )
}

type CardProps = {
  entry: DocxFileEntry
  isActive: boolean
  orderIndex?: number
  onSelect: () => void
  onRemove: () => void
}

function getHealthColor(entry: DocxFileEntry): string {
  if (entry.analysisLoading) return 'bg-muted-foreground/30 animate-pulse'
  if (!entry.analysis) return 'bg-transparent'
  const score = entry.analysis.score
  if (score >= 80) return 'bg-success'
  if (score >= 50) return 'bg-warning'
  return 'bg-destructive'
}

const SortableFileCard = memo(function SortableFileCard({ entry, isActive, orderIndex, onSelect, onRemove }: CardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const sizeMb = (entry.file.size / 1024 / 1024).toFixed(1)
  const healthColor = getHealthColor(entry)

  return (
    <div
      ref={setNodeRef}
      style={style}
      role="button"
      tabIndex={0}
      aria-current={isActive ? 'true' : undefined}
      className={cn(
        'group flex items-center gap-1.5 rounded-md text-xs cursor-pointer transition-all duration-150 overflow-hidden',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isActive ? 'bg-accent shadow-sm' : 'hover:bg-accent/50',
      )}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
    >
      {/* Health color indicator bar */}
      <div className={cn('w-[3px] self-stretch shrink-0 rounded-l-md', healthColor)} />

      {/* Drag handle */}
      <div {...attributes} {...listeners} className="cursor-grab text-muted-foreground shrink-0 py-2" aria-label="Drag to reorder">
        <GripVertical className="h-3 w-3" aria-hidden="true" />
      </div>

      {/* Merge order badge or file icon */}
      {orderIndex != null ? (
        <span className="h-4 w-4 rounded-full bg-muted text-[10px] font-semibold text-muted-foreground flex items-center justify-center shrink-0 tabular-nums" aria-hidden="true">
          {orderIndex}
        </span>
      ) : (
        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
      )}
      <div className="flex-1 min-w-0 py-1.5">
        <div className="truncate font-medium leading-tight">{entry.file.name}</div>
        <div className="text-[10px] text-muted-foreground leading-tight mt-0.5 flex items-center gap-1">
          <span>{sizeMb} MB</span>
          {entry.analysis && (
            <span>/ {entry.analysis.metadata.page_count_estimate}p</span>
          )}
          {entry.analysis && entry.analysis.issues.length > 0 && (
            <span className="inline-flex items-center gap-0.5 text-warning">
              <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
              {entry.analysis.issues.length}
            </span>
          )}
        </div>
      </div>

      {/* Remove button */}
      <Button
        variant="ghost"
        size="sm"
        className="h-5 w-5 p-0 shrink-0 mr-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
        onClick={(e) => { e.stopPropagation(); onRemove() }}
        aria-label={`Remove ${entry.file.name}`}
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </Button>
    </div>
  )
})
