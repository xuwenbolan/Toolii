import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { formatBytes } from '@/lib/fileValidation'

type Props = {
  files: File[]
  onMove: (index: number, direction: -1 | 1) => void
  onRemove: (index: number) => void
}

export function PdfMergeList({ files, onMove, onRemove }: Props) {
  const { t } = useTranslation('tools')

  if (files.length === 0) return null

  return (
    <div className="space-y-2">
      {files.map((file, index) => (
        <div
          key={`${file.name}-${index}-${file.size}`}
          className="rounded-md border p-2"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 sm:mt-3">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={index === 0}
              onClick={() => onMove(index, -1)}
            >
              {t('shared.moveUp')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={index === files.length - 1}
              onClick={() => onMove(index, 1)}
            >
              {t('shared.moveDown')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => onRemove(index)}>
              {t('shared.remove')}
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
