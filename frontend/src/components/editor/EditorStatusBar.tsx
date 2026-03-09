import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { countWords } from '@/lib/wordCount'
import { formatBytes } from '@/lib/fileValidation'

type SaveStatus = 'loading' | 'saving' | 'saved' | 'unsaved' | 'error'

type Props = {
  content: string
  currentBytes: number
  maxBytes: number
  saveStatus: SaveStatus
  saveError: string | null
  savedTime: string | null
  isApproachingLimit: boolean
  isOversize: boolean
}

const STATUS_DOT: Record<SaveStatus, string> = {
  loading: 'bg-muted-foreground',
  saving: 'bg-warning animate-pulse',
  saved: 'bg-success',
  unsaved: 'bg-warning',
  error: 'bg-destructive',
}

function formatTime(value: string | null, locale: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function EditorStatusBar({
  content,
  currentBytes,
  maxBytes,
  saveStatus,
  saveError,
  savedTime,
  isApproachingLimit,
  isOversize,
}: Props) {
  const { t, i18n } = useTranslation('docs')

  const { words, chars } = useMemo(() => countWords(content), [content])

  const statusLabel =
    saveStatus === 'loading'
      ? t('statusLoading')
      : saveStatus === 'saving'
        ? t('statusSaving')
        : saveStatus === 'error'
          ? (saveError ?? t('saveFailed'))
          : saveStatus === 'unsaved'
            ? t('statusUnsaved')
            : t('statusSaved', { date: formatTime(savedTime, i18n.language) })

  const sizeLabel = formatBytes(currentBytes)
  const sizeColor = isOversize
    ? 'text-destructive'
    : isApproachingLimit
      ? 'text-warning'
      : 'text-muted-foreground'

  return (
    <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-border/40 bg-background/80 backdrop-blur-sm print:hidden">
      <div className="mx-auto flex h-7 max-w-[1600px] items-center gap-4 px-3 text-[11px] text-muted-foreground sm:px-4">
        {/* Save status */}
        <div className="flex items-center gap-1.5">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[saveStatus]}`} />
          <span className={saveStatus === 'error' ? 'text-destructive' : ''}>{statusLabel}</span>
        </div>

        <div className="flex-1" />

        {/* Word & char count */}
        <span>{t('wordCount', { count: words })}</span>
        <span>{t('charCount', { count: chars })}</span>

        {/* Size */}
        <span className={sizeColor}>
          {sizeLabel} / {formatBytes(maxBytes)}
        </span>
      </div>
    </footer>
  )
}
