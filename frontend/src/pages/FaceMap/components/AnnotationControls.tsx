import { useTranslation } from 'react-i18next'
import { Eye, EyeOff } from 'lucide-react'

import { cn } from '@/lib/utils'

export type AnnotationLayers = {
  contour: boolean
  threeCourts: boolean
  fiveEyes: boolean
  keyPoints: boolean
}

type Props = {
  layers: AnnotationLayers
  onToggle: (layer: keyof AnnotationLayers) => void
}

const LAYER_KEYS: (keyof AnnotationLayers)[] = ['contour', 'threeCourts', 'fiveEyes', 'keyPoints']

export function AnnotationControls({ layers, onToggle }: Props) {
  const { t } = useTranslation('faceMap')

  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {LAYER_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
            layers[key]
              ? 'bg-primary/10 text-primary'
              : 'bg-muted/50 text-muted-foreground',
          )}
          onClick={() => onToggle(key)}
        >
          {layers[key] ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          {t(`annotation.${key}`)}
        </button>
      ))}
    </div>
  )
}
