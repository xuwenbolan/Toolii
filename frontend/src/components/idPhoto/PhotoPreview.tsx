import { useTranslation } from 'react-i18next'

type Props = {
  src: string
  title?: string
  subtitle?: string
}

export function PhotoPreview({ src, title, subtitle }: Props) {
  const { t } = useTranslation('idPhoto')

  return (
    <div className="space-y-2 rounded-xl border p-3">
      <div>
        <h3 className="text-sm font-semibold">{title ?? t('preview.watermarkAlt')}</h3>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="rounded-lg bg-gradient-to-br from-slate-50 to-slate-100 p-3">
        <img
          src={src}
          alt={t('preview.title')}
          className="mx-auto max-h-[360px] w-auto rounded-md border bg-white shadow-sm"
        />
      </div>
    </div>
  )
}
