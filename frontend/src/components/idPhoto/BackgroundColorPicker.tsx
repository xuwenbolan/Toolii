import { Check, Pipette, Palette } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

function normalizeHex(value: string) {
  const trimmed = value.trim()
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`
  return withHash.toUpperCase()
}

function isHexColor(value: string) {
  return /^#[0-9A-F]{6}$/i.test(value.trim())
}

export function BackgroundColorPicker({ value, onChange }: Props) {
  const { t } = useTranslation('idPhoto')
  const [manualHex, setManualHex] = useState(value)
  const normalizedManualHex = normalizeHex(manualHex)
  const isManualHexValid = isHexColor(normalizedManualHex)
  const normalizedSelected = useMemo(() => normalizeHex(value), [value])

  useEffect(() => {
    setManualHex(value)
  }, [value])

  return (
    <div className="space-y-3">
      <Label>{t('bgColor.title')}</Label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            className={[
              'flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
              normalizedSelected === preset.value
                ? 'border-info/40 bg-info-light ring-1 ring-info/30'
                : 'hover:bg-muted/50',
            ].join(' ')}
            onClick={() => onChange(preset.value)}
          >
            <span className="flex items-center gap-2">
              <span
                className="h-4 w-4 rounded-full border"
                style={{ backgroundColor: preset.value }}
                aria-hidden="true"
              />
              <span>{t(preset.i18nKey)}</span>
            </span>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              {normalizedSelected === preset.value ? <Check className="h-3.5 w-3.5 text-info" aria-hidden /> : null}
              {preset.value}
            </span>
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200/80 bg-white/70 p-3 dark:border-slate-800 dark:bg-slate-900/60">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium">{t('bgColor.previewTitle')}</p>
          <span className="rounded-full border border-slate-300/80 bg-slate-100/80 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {t('bgColor.active')}
          </span>
        </div>
        <div
          className="mt-2 overflow-hidden rounded-md border border-slate-300/80 p-3 dark:border-slate-700"
          style={{ backgroundColor: normalizedSelected }}
        >
          <div className="grid place-items-center rounded-md border border-white/60 bg-white/20 py-4 backdrop-blur-[1px]">
            <div className="relative h-20 w-14 rounded-sm border border-white/80 bg-white/90 shadow-sm">
              <div className="absolute left-1/2 top-3 h-4 w-4 -translate-x-1/2 rounded-full bg-slate-400/70" />
              <div className="absolute left-1/2 top-8 h-7 w-6 -translate-x-1/2 rounded-t-full bg-slate-400/70" />
            </div>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">{t('bgColor.previewHint')}</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-[auto_1fr_auto]">
        <input
          aria-label={t('bgColor.customLabel')}
          type="color"
          value={normalizedSelected}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 rounded border bg-background p-1"
        />
        <Input
          value={manualHex}
          onChange={(e) => setManualHex(e.target.value)}
          placeholder="#FFFFFF"
          aria-label={t('bgColor.hex')}
        />
        <Button
          type="button"
          variant="outline"
          disabled={!isManualHexValid}
          onClick={() => onChange(normalizedManualHex)}
        >
          {t('bgColor.apply')}
        </Button>
      </div>

      <div className="grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-2">
        <p className="flex items-center gap-1.5">
          <Palette className="h-3.5 w-3.5" aria-hidden />
          {t('bgColor.tipSolid')}
        </p>
        <p className="flex items-center gap-1.5">
          <Pipette className="h-3.5 w-3.5" aria-hidden />
          {t('bgColor.tipContrast')}
        </p>
      </div>

      <div
        className={cn(
          'rounded-md border border-dashed px-2 py-1 text-[11px]',
          isManualHexValid
            ? 'border-slate-300/80 text-muted-foreground dark:border-slate-700'
            : 'border-destructive/30 text-destructive',
        )}
      >
        {isManualHexValid ? `${t('bgColor.hex')}: ${normalizedManualHex}` : t('bgColor.invalidHex')}
      </div>
    </div>
  )
}
