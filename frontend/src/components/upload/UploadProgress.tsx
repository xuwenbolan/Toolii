import { useTranslation } from 'react-i18next'

type Props = {
  value: number | null
  label?: string
}

export function UploadProgress({ value, label }: Props) {
  const { t } = useTranslation('common')
  const resolvedLabel = label ?? t('upload.progress')

  if (value == null) return null

  const pct = Math.max(0, Math.min(100, Math.round(value)))

  return (
    <div className="space-y-1" role="status" aria-live="polite" aria-atomic="true">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{resolvedLabel}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted">
        <div
          className="h-2 rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="sr-only">{`${resolvedLabel}: ${pct}%`}</span>
    </div>
  )
}
