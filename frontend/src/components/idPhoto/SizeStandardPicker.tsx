import { BadgeInfo, CheckCircle2, ScanFace, Ruler } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { STANDARD_I18N_MAP } from '@/config/photoStandards'
import { cn } from '@/lib/utils'
import type { PhotoStandard } from '@/services/idPhotoApi'

import { Label } from '@/components/ui/label'

type Props = {
  standards: PhotoStandard[]
  value: string
  onChange: (value: string) => void
}

const MM_PER_INCH = 25.4

function mmToPx(mm: number, dpi: number) {
  return Math.round((mm / MM_PER_INCH) * dpi)
}

function formatNum(value: number) {
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(1).replace(/\.0$/, '')
}

export function SizeStandardPicker({ standards, value, onChange }: Props) {
  const { t } = useTranslation('idPhoto')
  const selected = standards.find((item) => item.code === value) ?? standards[0] ?? null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label htmlFor="photo-standard">{t('sizeStandard.title')}</Label>
        <span className="text-[11px] text-muted-foreground">{t('sizeStandard.count', { count: standards.length })}</span>
      </div>

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

      <div className="grid gap-2 sm:grid-cols-2">
        {standards.map((item) => {
          const selectedItem = value === item.code
          const i18nKey = STANDARD_I18N_MAP[item.code]
          const displayName = i18nKey ? t(i18nKey) : item.name
          const frameScale = Math.min(84 / item.width_mm, 108 / item.height_mm)
          const frameWidth = Math.max(32, Math.round(item.width_mm * frameScale))
          const frameHeight = Math.max(32, Math.round(item.height_mm * frameScale))
          const topMargin = Math.round(item.top_margin_ratio * 100)
          const faceHeight = Math.round(item.face_height_ratio * 100)
          return (
            <button
              key={item.code}
              type="button"
              className={cn(
                'group rounded-lg border p-3 text-left transition-all',
                selectedItem
                  ? 'border-teal-400/70 bg-teal-50/60 ring-1 ring-teal-300 dark:border-teal-700 dark:bg-teal-950/20'
                  : 'border-slate-200/80 bg-white/70 hover:border-slate-300 hover:bg-slate-50/90 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700',
              )}
              onClick={() => onChange(item.code)}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium">{displayName}</p>
                {selectedItem ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-600 dark:text-teal-300" aria-hidden />
                ) : null}
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {formatNum(item.width_mm)}x{formatNum(item.height_mm)}mm
              </p>

              <div className="mt-2 flex items-center gap-3">
                <div className="relative grid h-28 w-24 place-items-center rounded-md border border-dashed border-slate-300/80 bg-slate-100/70 dark:border-slate-700 dark:bg-slate-900/60">
                  <div
                    className="relative rounded-sm border border-slate-400/80 bg-white shadow-sm dark:border-slate-500 dark:bg-slate-200"
                    style={{ width: `${frameWidth}px`, height: `${frameHeight}px` }}
                    aria-hidden
                  >
                    <div
                      className="absolute left-1/2 w-4 -translate-x-1/2 rounded-sm border border-teal-500/80 bg-teal-500/20"
                      style={{
                        top: `${topMargin}%`,
                        height: `${Math.max(12, faceHeight)}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="space-y-1.5 text-[11px] text-muted-foreground">
                  <p className="flex items-center gap-1">
                    <Ruler className="h-3.5 w-3.5" aria-hidden />
                    {t('sizeStandard.ratio')}: {formatNum(item.width_mm)}:{formatNum(item.height_mm)}
                  </p>
                  <p className="flex items-center gap-1">
                    <BadgeInfo className="h-3.5 w-3.5" aria-hidden />
                    {t('sizeStandard.pixels')}: {mmToPx(item.width_mm, item.dpi)}x{mmToPx(item.height_mm, item.dpi)}px
                  </p>
                  <p className="flex items-center gap-1">
                    <ScanFace className="h-3.5 w-3.5" aria-hidden />
                    {t('sizeStandard.safeZoneHint', { top: topMargin, face: faceHeight })}
                  </p>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {selected ? (
        <div className="rounded-lg border border-dashed border-slate-300/80 bg-slate-100/60 p-3 text-xs dark:border-slate-700 dark:bg-slate-900/50">
          <p className="font-medium text-slate-700 dark:text-slate-200">{t('sizeStandard.selected')}</p>
          <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
            <p className="text-muted-foreground">
              {t('sizeStandard.dimensions')}: {formatNum(selected.width_mm)}x{formatNum(selected.height_mm)}mm
            </p>
            <p className="text-muted-foreground">
              {t('sizeStandard.dpi')}: {selected.dpi}
            </p>
            <p className="text-muted-foreground">
              {t('sizeStandard.topMargin')}: {Math.round(selected.top_margin_ratio * 100)}%
            </p>
            <p className="text-muted-foreground">
              {t('sizeStandard.face')}: {Math.round(selected.face_height_ratio * 100)}%
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
