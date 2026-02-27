import { useTranslation } from 'react-i18next'

import { Label } from '@/components/ui/label'

type Props = {
  value: string
  onChange: (value: string) => void
}

// Preset key mapped to i18n key and hex value
const PRESETS = [
  { i18nKey: 'bgColor.white', value: '#FFFFFF' },
  { i18nKey: 'bgColor.blue', value: '#4C8BF5' },
  { i18nKey: 'bgColor.lightBlue', value: '#DDEBFF' },
  { i18nKey: 'bgColor.red', value: '#D93E3E' },
] as const

export function BackgroundColorPicker({ value, onChange }: Props) {
  const { t } = useTranslation('idPhoto')

  return (
    <div className="space-y-2">
      <Label>{t('bgColor.title')}</Label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            className={[
              'flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
              value.toLowerCase() === preset.value.toLowerCase()
                ? 'border-primary bg-primary/10 ring-1 ring-primary'
                : 'hover:bg-muted/50',
            ].join(' ')}
            onClick={() => onChange(preset.value)}
          >
            <span
              className="h-4 w-4 rounded-full border"
              style={{ backgroundColor: preset.value }}
              aria-hidden="true"
            />
            {t(preset.i18nKey)}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input
          aria-label={t('bgColor.customLabel')}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 rounded border bg-background p-1"
        />
        <code className="rounded bg-muted px-2 py-1 text-xs">{value}</code>
      </div>
    </div>
  )
}
