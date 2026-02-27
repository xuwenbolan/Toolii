import { useTranslation } from 'react-i18next'

import { Label } from '@/components/ui/label'

type Tier = 'fast' | 'balanced' | 'hq'

type Props = {
  value: Tier
  onChange: (value: Tier) => void
}

// Tier config with i18n keys
const TIERS: Array<{ value: Tier; labelKey: string; descKey: string }> = [
  { value: 'fast', labelKey: 'modelTier.fast', descKey: 'modelTier.fastDesc' },
  { value: 'balanced', labelKey: 'modelTier.balanced', descKey: 'modelTier.balancedDesc' },
  { value: 'hq', labelKey: 'modelTier.quality', descKey: 'modelTier.qualityDesc' },
]

export function ModelTierSelector({ value, onChange }: Props) {
  const { t } = useTranslation('idPhoto')

  return (
    <div className="space-y-2">
      <Label>{t('modelTier.title')}</Label>
      <div className="grid gap-2">
        {TIERS.map((tier) => (
          <button
            key={tier.value}
            type="button"
            className={[
              'rounded-md border px-3 py-2 text-left transition-colors',
              value === tier.value
                ? 'border-primary bg-primary/10 ring-1 ring-primary'
                : 'hover:bg-muted/50',
            ].join(' ')}
            onClick={() => onChange(tier.value)}
          >
            <p className={['text-sm font-medium', value === tier.value ? 'text-primary' : ''].join(' ')}>
              {t(tier.labelKey)}
            </p>
            <p className="text-xs text-muted-foreground">{t(tier.descKey)}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
