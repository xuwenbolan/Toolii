import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CalendarPlus,
  Check,
  Download,
  Eye,
  Loader2,
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

type DownloadPhase = 'idle' | 'loading' | 'done'

export function FileRowActions({
  isMarkdown,
  isPreviewable,
  onEdit,
  onPreview,
  onRename,
  onExtend,
  onShare,
  onDownload,
  onDelete,
}: {
  isMarkdown?: boolean
  isPreviewable?: boolean
  onEdit?: () => void
  onPreview?: () => void
  onRename: () => void
  onExtend: () => void
  onShare: () => void
  onDownload: () => Promise<void> | void
  onDelete: () => void
}) {
  const { t } = useTranslation('hub')
  const [dlPhase, setDlPhase] = useState<DownloadPhase>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleDownload = useCallback(async () => {
    if (dlPhase !== 'idle') return
    setDlPhase('loading')
    try {
      await onDownload()
      setDlPhase('done')
      timerRef.current = setTimeout(() => setDlPhase('idle'), 1500)
    } catch {
      setDlPhase('idle')
    }
  }, [dlPhase, onDownload])

  const dlIcon =
    dlPhase === 'loading' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
    dlPhase === 'done' ? <Check className="h-3.5 w-3.5 text-success" /> :
    <Download className="h-3.5 w-3.5" />

  return (
    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-7 w-7 transition-[background-color,transform] duration-[var(--duration-fast)] hover:bg-foreground/10 active:scale-90"
        disabled={dlPhase === 'loading'}
        onClick={() => { void handleDownload() }}
        aria-label={t('download')}
      >
        {dlIcon}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 transition-[background-color,transform] duration-[var(--duration-fast)] hover:bg-foreground/10 active:scale-90"
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
          {isPreviewable && onPreview && (
            <DropdownMenuItem onClick={onPreview}>
              <Eye className="h-4 w-4" />
              {t('preview')}
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
