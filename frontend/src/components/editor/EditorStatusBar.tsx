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
  saveFlash?: boolean
}

const STATUS_DOT: Record<SaveStatus, string> = {
  loading: 'bg-muted-foreground',
  saving: 'bg-warning animate-pulse',
  saved: 'bg-success',
  unsaved: 'bg-warning',
  error: 'bg-destructive',
}

function formatTime(value: string | null, locale: string, justNow: string, minutesAgo: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const diffMs = Date.now() - date.getTime()
  if (diffMs < 60_000) return justNow
  if (diffMs < 30 * 60_000) {
    const mins = Math.floor(diffMs / 60_000)
    return minutesAgo.replace('{{count}}', String(mins))
  }

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
  saveFlash,
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
            : t('statusSaved', { date: formatTime(savedTime, i18n.language, t('justNow'), t('minutesAgo')) })

  const sizeLabel = formatBytes(currentBytes)
  const sizeColor = isOversize
    ? 'text-destructive'
    : isApproachingLimit
      ? 'text-warning'
      : 'text-muted-foreground'

  return (
    <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-border/40 bg-background/80 backdrop-blur-sm print:hidden">
      <div className="mx-auto flex h-7 max-w-[1600px] items-center gap-2.5 px-3 text-[11px] text-muted-foreground sm:px-4">
        {/* Save status */}
        <div className="flex items-center gap-1.5">
          <span className={`inline-block h-2 w-2 rounded-full transition-colors duration-[var(--duration-normal)] ${STATUS_DOT[saveStatus]}`} />
          <span className={saveStatus === 'error' ? 'text-destructive' : saveFlash ? 'text-success transition-colors duration-[var(--duration-normal)]' : 'transition-colors duration-[var(--duration-normal)]'}>{statusLabel}</span>
        </div>

        <div className="flex-1" />

        {/* Word & char count */}
        <span className="hidden sm:inline">{t('wordCount', { count: words })}</span>
        <span className="hidden select-none text-border sm:inline" aria-hidden="true">&middot;</span>
        <span>{t('charCount', { count: chars })}</span>
        <span className="hidden select-none text-border sm:inline" aria-hidden="true">&middot;</span>

        {/* Size — hidden on small screens */}
        <span className={`hidden sm:inline ${sizeColor}`}>
          {sizeLabel} / {formatBytes(maxBytes)}
        </span>
      </div>
    </footer>
  )
}
