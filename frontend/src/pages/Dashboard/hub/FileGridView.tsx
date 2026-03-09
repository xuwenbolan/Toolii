import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { formatBytes } from '@/lib/fileValidation'
import type { UserFileItem } from '@/services/hubApi'

import { FileRowActions } from './FileRowActions'
import { getFileTypeIcon, isImageType } from './fileTypeIcons'
import { useFileThumbnail } from './useFileThumbnail'
import { formatTime, isMarkdownFile } from './utils'

function GridCard({
  item,
  isSelected,
  onToggleSelect,
  onEdit,
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
  onRename: () => void
  onExtend: () => void
  onShare: () => void
  onDownload: () => void
  onDelete: () => void
}) {
  const { t, i18n } = useTranslation('hub')
  const isImage = isImageType(item.content_type)
  const { url: thumbUrl } = useFileThumbnail(item.id, item.content_type, isImage)
  const Icon = getFileTypeIcon(item.content_type)
  const isMd = isMarkdownFile(item.file_name)

  return (
    <div
      className={[
        'group relative flex flex-col overflow-hidden rounded-lg border transition-colors',
        isSelected ? 'border-foreground/30 bg-muted/40' : 'border-border/70 hover:border-border',
      ].join(' ')}
    >
      {/* Thumbnail / icon area */}
      <div className="relative flex aspect-square items-center justify-center bg-muted/30">
        {isImage && thumbUrl ? (
          <img
            src={thumbUrl}
            alt={item.file_name}
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <Icon className="h-10 w-10 text-muted-foreground/50" />
        )}
        {/* Checkbox overlay */}
        <div className={[
          'absolute left-2 top-2 transition-opacity',
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        ].join(' ')}>
          <Checkbox
            checked={isSelected}
            onCheckedChange={onToggleSelect}
            aria-label={item.file_name}
            className="bg-background/80"
          />
        </div>
        {/* Actions overlay */}
        <div className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100">
          <FileRowActions
            isMarkdown={isMd}
            onEdit={onEdit}
            onRename={onRename}
            onExtend={onExtend}
            onShare={onShare}
            onDownload={onDownload}
            onDelete={onDelete}
          />
        </div>
      </div>

      {/* Info area */}
      <div className="space-y-0.5 px-2.5 py-2">
        {isMd ? (
          <button
            type="button"
            className="w-full truncate text-left text-sm font-medium transition hover:text-primary"
            onClick={onEdit}
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
