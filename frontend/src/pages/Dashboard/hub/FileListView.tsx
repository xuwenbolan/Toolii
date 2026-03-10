import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { formatBytes } from '@/lib/fileValidation'
import type { UserFileItem } from '@/services/hubApi'

import { FileRowActions } from './FileRowActions'
import { getFileTypeIcon } from './fileTypeIcons'
import { formatTime, isMarkdownFile } from './utils'

export function FileListView({
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
  const { t, i18n } = useTranslation('hub')

  return (
    <div className="divide-y divide-border/50">
      {items.map((item) => {
        const Icon = getFileTypeIcon(item.content_type)
        const isSelected = selected.has(item.id)
        const isMd = isMarkdownFile(item.file_name)

        return (
          <div
            key={item.id}
            className={[
              'flex items-center gap-3 px-3 py-3',
              'transition-colors duration-[var(--duration-fast)]',
              'hover:bg-muted/40',
              isSelected ? 'bg-muted/40' : '',
            ].join(' ')}
          >
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleSelect(item.id)}
              aria-label={item.file_name}
            />
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/60">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              {isMd ? (
                <button
                  type="button"
                  className="truncate text-left text-sm font-medium transition hover:text-primary"
                  onClick={() => onEdit(item)}
                >
                  {item.file_name}
                </button>
              ) : (
                <p className="truncate text-sm font-medium">{item.file_name}</p>
              )}
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                <Badge variant="outline" className="text-xs">
                  {item.source === 'upload' ? t('sourceUpload') : t('sourceTool')}
                </Badge>
                <span>{formatBytes(item.size)}</span>
                {item.expires_at && (
                  <span>&middot; {t('expires', { date: formatTime(item.expires_at, i18n.language) })}</span>
                )}
                {item.share_count > 0 && (
                  <span>&middot; {t('shareCount', { count: item.share_count })}</span>
                )}
              </p>
            </div>
            <FileRowActions
              isMarkdown={isMd}
              onEdit={() => onEdit(item)}
              onRename={() => onRename(item)}
              onExtend={() => onExtend(item)}
              onShare={() => onShare(item)}
              onDownload={() => onDownload(item)}
              onDelete={() => onDelete(item)}
            />
          </div>
        )
      })}
    </div>
  )
}
