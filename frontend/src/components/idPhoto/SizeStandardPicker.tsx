import { useTranslation } from 'react-i18next'

import type { PhotoStandard } from '@/services/idPhotoApi'

import { Label } from '@/components/ui/label'

type Props = {
  standards: PhotoStandard[]
  value: string
  onChange: (value: string) => void
}

// Map standard code to translation key
const STANDARD_I18N_MAP: Record<string, string> = {
  'uk-passport': 'standards.ukPassport',
  'schengen-visa': 'standards.schengenVisa',
  'cn-passport': 'standards.cnPassport',
  'us-2x2': 'standards.us2x2',
}

export function SizeStandardPicker({ standards, value, onChange }: Props) {
  const { t } = useTranslation('idPhoto')

  return (
    <div className="space-y-2">
      <Label htmlFor="photo-standard">{t('sizeStandard.title')}</Label>
      <select
        id="photo-standard"
        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {standards.map((item) => {
          const i18nKey = STANDARD_I18N_MAP[item.code]
          const displayName = i18nKey ? t(i18nKey) : item.name
          return (
            <option key={item.code} value={item.code}>
              {displayName} ({item.width_mm}x{item.height_mm}mm)
            </option>
          )
        })}
      </select>
    </div>
  )
}
