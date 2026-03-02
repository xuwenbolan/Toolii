import { Camera } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { PhotoAngleResult } from '@/services/faceMapApi'

export function PhotoAngleCard({ data }: { data: PhotoAngleResult }) {
  const { t } = useTranslation('faceMap')

  const sideLabel = t(`photoAngle.sides.${data.best_side}`, data.best_side)
  const angleLabel = t(`photoAngle.angles.${data.vertical_angle}`, data.vertical_angle)

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Camera className="h-3.5 w-3.5" />
        {t('profile.photoAngle')}
      </h3>
      <div className="grid grid-cols-1 min-[360px]:grid-cols-3 gap-2 sm:gap-3 text-center">
        <div>
          <p className="text-xs text-muted-foreground">{t('photoAngle.bestSide')}</p>
          <p className="text-sm font-semibold">{sideLabel}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('photoAngle.verticalAngle')}</p>
          <p className="text-sm font-semibold">{angleLabel}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('photoAngle.expressionTip')}</p>
          <p className="text-sm font-semibold">{data.expression_tip}</p>
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{data.rationale}</p>
    </div>
  )
}
