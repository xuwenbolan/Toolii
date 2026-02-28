import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { arrayMove } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import { useDropzone } from 'react-dropzone'

import { PdfPageCard } from '@/components/pdf/PdfPageCard'
import type { PageEntry } from '@/hooks/usePdfWorkspace'

type Props = {
  pages: PageEntry[]
  thumbnails: Map<string, string>
  selectedIds: Set<string>
  loading: boolean
  onReorder: (pages: PageEntry[]) => void
  onToggleSelect: (id: string, shiftKey: boolean) => void
  onRotatePage: (id: string) => void
  onDeletePage: (id: string) => void
  onAddFiles: (files: File[]) => void
  onPreviewPage?: (index: number) => void
}

function SortablePageCard({
  page,
  index,
  thumbnailUrl,
  selected,
  loading,
  onToggleSelect,
  onRotate,
  onDelete,
  onPreview,
}: {
  page: PageEntry
  index: number
  thumbnailUrl: string | undefined
  selected: boolean
  loading: boolean
  onToggleSelect: (shiftKey: boolean) => void
  onRotate: () => void
  onDelete: () => void
  onPreview?: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id,
  })

  const style = {
    transform: transform
      ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`
      : undefined,
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.6 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <PdfPageCard
        pageIndex={index}
        thumbnailUrl={thumbnailUrl}
        rotation={page.rotation}
        selected={selected}
        loading={loading}
        onToggleSelect={onToggleSelect}
        onRotate={onRotate}
        onDelete={onDelete}
        onPreview={onPreview}
      />
    </div>
  )
}

function AddMoreCard({ onAddFiles }: { onAddFiles: (files: File[]) => void }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (accepted) => {
      if (accepted.length > 0) onAddFiles(accepted)
    },
    accept: { 'application/pdf': [], 'image/*': [] },
    multiple: true,
    noClick: false,
    noKeyboard: true,
  })

  return (
    <div
      {...getRootProps()}
      className={[
        'flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed transition-colors',
        isDragActive
          ? 'border-primary/60 bg-primary/5'
          : 'border-border/50 bg-muted/10 hover:border-primary/40 hover:bg-muted/20',
      ].join(' ')}
    >
      <input {...getInputProps()} />
      <Plus className="h-6 w-6 text-muted-foreground/60" />
      <span className="px-2 text-center text-[11px] text-muted-foreground/60">
        Add files
      </span>
    </div>
  )
}

export function PdfWorkspaceGrid({
  pages,
  thumbnails,
  selectedIds,
  loading,
  onReorder,
  onToggleSelect,
  onRotatePage,
  onDeletePage,
  onAddFiles,
  onPreviewPage,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )

  const pagesRef = useRef(pages)
  useEffect(() => {
    pagesRef.current = pages
  }, [pages])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const current = pagesRef.current
      const fromIdx = current.findIndex((p) => p.id === active.id)
      const toIdx = current.findIndex((p) => p.id === over.id)
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return
      onReorder(arrayMove(current, fromIdx, toIdx))
    },
    [onReorder],
  )

  const pageIds = useMemo(() => pages.map((p) => p.id), [pages])

  // Whole-grid drop zone for adding files by dragging from desktop
  const { getRootProps, isDragActive: isFileDragActive } = useDropzone({
    onDrop: (accepted) => {
      if (accepted.length > 0) onAddFiles(accepted)
    },
    accept: { 'application/pdf': [], 'image/*': [] },
    multiple: true,
    noClick: true,
    noKeyboard: true,
    noDragEventsBubbling: true,
  })

  return (
    <div
      {...getRootProps()}
      className={[
        'relative min-h-[50vh] rounded-xl border-2 border-dashed p-3 transition-colors sm:p-4',
        // Dot grid background
        '[background-image:radial-gradient(circle,rgb(0_0_0/0.06)_1px,transparent_1px)] [background-size:20px_20px]',
        isFileDragActive
          ? 'border-primary/50 bg-primary/[0.03]'
          : 'border-transparent bg-muted/[0.02]',
      ].join(' ')}
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={pageIds} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
            {pages.map((page, index) => (
              <SortablePageCard
                key={page.id}
                page={page}
                index={index}
                thumbnailUrl={thumbnails.get(page.id)}
                selected={selectedIds.has(page.id)}
                loading={loading && !thumbnails.has(page.id)}
                onToggleSelect={(shiftKey) => onToggleSelect(page.id, shiftKey)}
                onRotate={() => onRotatePage(page.id)}
                onDelete={() => onDeletePage(page.id)}
                onPreview={onPreviewPage ? () => onPreviewPage(index) : undefined}
              />
            ))}
            <AddMoreCard onAddFiles={onAddFiles} />
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
