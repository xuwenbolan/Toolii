import { useTranslation } from 'react-i18next'
import {
  CalendarPlus,
  Download,
  MoreHorizontal,
  Pencil,
  Share2,
  SquarePen,
  Trash2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function FileRowActions({
  isMarkdown,
  onEdit,
  onRename,
  onExtend,
  onShare,
  onDownload,
  onDelete,
}: {
  isMarkdown?: boolean
  onEdit?: () => void
  onRename: () => void
  onExtend: () => void
  onShare: () => void
  onDownload: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation('hub')

  return (
    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        onClick={onDownload}
        aria-label={t('download')}
      >
        <Download className="h-3.5 w-3.5" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label={t('moreActions')}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {isMarkdown && onEdit && (
            <DropdownMenuItem onClick={onEdit}>
              <SquarePen className="h-4 w-4" />
              {t('editDoc')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onShare}>
            <Share2 className="h-4 w-4" />
            {t('share')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onRename}>
            <Pencil className="h-4 w-4" />
            {t('rename')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onExtend}>
            <CalendarPlus className="h-4 w-4" />
            {t('extend')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
            {t('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
