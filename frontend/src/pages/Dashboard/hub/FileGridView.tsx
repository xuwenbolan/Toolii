import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { formatBytes } from '@/lib/fileValidation'
import type { UserFileItem } from '@/services/hubApi'

import { FileRowActions } from './FileRowActions'
import { getFileExtension, getFileTypeIcon, isImageType, isPdfType } from './fileTypeIcons'
import { useFileThumbnail } from './useFileThumbnail'
import { formatTime, isMarkdownFile } from './utils'

function GridCard({
  item,
  isSelected,
  onToggleSelect,
  onEdit,
  onPreview,
  onRename,
  onExtend,
  onShare,
  onDownload,
  onDelete,
}: {
  item: UserFileItem
  isSelected: boolean
  onToggleSelect: () => void
  onEdit: () => void
  onPreview: () => void
  onRename: () => void
  onExtend: () => void
  onShare: () => void
  onDownload: () => void
  onDelete: () => void
}) {
  const { t, i18n } = useTranslation('hub')
  const isImage = isImageType(item.content_type)
  const isPdf = isPdfType(item.content_type)
  const { url: thumbUrl } = useFileThumbnail(item.id, item.content_type, isImage)
  const Icon = getFileTypeIcon(item.content_type)
  const isMd = isMarkdownFile(item.file_name)
  const ext = getFileExtension(item.file_name)

  return (
    <div
      role="button"
      tabIndex={0}
      className={[
        'group relative flex cursor-pointer select-none flex-col overflow-hidden rounded-xl border',
        'transition-[border-color,box-shadow] duration-[var(--duration-fast)]',
        isSelected
          ? 'border-foreground/30 bg-muted/40'
          : 'border-border/70 hover:border-border hover:shadow-md active:bg-muted/30',
      ].join(' ')}
      onClick={onToggleSelect}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggleSelect() } }}
    >
      {/* Thumbnail / icon area */}
      <div className="relative flex aspect-[4/3] items-center justify-center bg-muted/30">
        {isImage && thumbUrl ? (
          <img
            src={thumbUrl}
            alt={item.file_name}
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Icon className="h-12 w-12 text-muted-foreground/40" />
            {ext && (
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
                {ext}
              </span>
            )}
          </div>
        )}
        {/* Checkbox overlay — always visible on touch devices, hover-reveal on desktop */}
        <div
          className={[
            'absolute left-2 top-2 transition-opacity duration-[var(--duration-fast)]',
            isSelected ? 'opacity-100' : 'opacity-0 touch-device:opacity-100 group-hover:opacity-100',
          ].join(' ')}
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={isSelected}
            onCheckedChange={onToggleSelect}
            aria-label={item.file_name}
            className="bg-background/80"
          />
        </div>
        {/* Actions overlay — always visible on touch devices */}
        <div
          className="absolute right-1 top-1 opacity-0 transition-opacity duration-[var(--duration-fast)] touch-device:opacity-100 group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <FileRowActions
            isMarkdown={isMd}
            isPreviewable={isPdf || isImage}
            onEdit={onEdit}
            onPreview={onPreview}
            onRename={onRename}
            onExtend={onExtend}
            onShare={onShare}
            onDownload={onDownload}
            onDelete={onDelete}
          />
        </div>
      </div>

      {/* Info area */}
      <div className="space-y-1 px-3 py-2.5">
        {isMd ? (
          <button
            type="button"
            className="w-full truncate text-left text-sm font-medium transition hover:text-primary"
            onClick={(e) => { e.stopPropagation(); onEdit() }}
          >
            {item.file_name}
          </button>
        ) : isPdf ? (
          <button
            type="button"
            className="w-full truncate text-left text-sm font-medium transition hover:text-primary"
            onClick={(e) => { e.stopPropagation(); onPreview() }}
          >
            {item.file_name}
          </button>
        ) : (
          <p className="truncate text-sm font-medium">{item.file_name}</p>
        )}
        <p className="truncate text-xs text-muted-foreground">
          {formatBytes(item.size)}
          {item.expires_at && (
            <> &middot; {t('expires', { date: formatTime(item.expires_at, i18n.language) })}</>
          )}
        </p>
      </div>
    </div>
  )
}

export function FileGridView({
  items,
  selected,
  onToggleSelect,
  onEdit,
  onPreview,
  onRename,
  onExtend,
  onShare,
  onDownload,
  onDelete,
}: {
  items: UserFileItem[]
  selected: Set<number>
  onToggleSelect: (id: number) => void
  onEdit: (item: UserFileItem) => void
  onPreview: (item: UserFileItem) => void
  onRename: (item: UserFileItem) => void
  onExtend: (item: UserFileItem) => void
  onShare: (item: UserFileItem) => void
  onDownload: (item: UserFileItem) => void
  onDelete: (item: UserFileItem) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((item) => (
        <GridCard
          key={item.id}
          item={item}
          isSelected={selected.has(item.id)}
          onToggleSelect={() => onToggleSelect(item.id)}
          onEdit={() => onEdit(item)}
          onPreview={() => onPreview(item)}
          onRename={() => onRename(item)}
          onExtend={() => onExtend(item)}
          onShare={() => onShare(item)}
          onDownload={() => onDownload(item)}
          onDelete={() => onDelete(item)}
        />
      ))}
    </div>
  )
}
