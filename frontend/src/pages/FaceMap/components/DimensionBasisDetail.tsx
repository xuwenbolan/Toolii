import { Fragment, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { AestheticsDimension } from '@/services/faceMapApi'

type Props = {
  dimensions: AestheticsDimension[]
}

export function DimensionBasisDetail({ dimensions }: Props) {
  const { t } = useTranslation('faceMap')
  const [expanded, setExpanded] = useState(false)

  const withBasis = dimensions.filter((d) => d.basis && d.basis.length > 0)
  if (withBasis.length === 0) return null

  return (
    <div className="w-full">
      <button
        type="button"
        className="flex w-full items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span>{expanded ? t('dimensionBasis.collapse') : t('dimensionBasis.expand')}</span>
        <ChevronDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} />
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 text-left">
          {withBasis.map((d) => (
            <div key={d.id} className="space-y-1">
              <p className="text-xs font-semibold">{d.label}</p>
              <div className="grid grid-cols-3 gap-x-1 sm:gap-x-2 gap-y-0.5 text-[10px] sm:text-[11px]">
                <span className="text-muted-foreground font-medium">{t('dimensionBasis.metric')}</span>
                <span className="text-muted-foreground font-medium">{t('dimensionBasis.value')}</span>
                <span className="text-muted-foreground font-medium">{t('dimensionBasis.ideal')}</span>
                {d.basis!.map((b) => (
                  <Fragment key={b.key}>
                    <span className="text-muted-foreground">{t(`dimensionBasis.keys.${b.key}`, b.key)}</span>
                    <span className="font-medium tabular-nums">{typeof b.value === 'number' ? b.value.toFixed(2) : b.value}</span>
                    <span className="text-muted-foreground/70 tabular-nums">{b.ideal != null ? (typeof b.ideal === 'number' ? b.ideal.toFixed(2) : b.ideal) : '-'}</span>
                  </Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
