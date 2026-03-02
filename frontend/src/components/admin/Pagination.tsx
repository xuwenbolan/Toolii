import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

type Props = {
  offset: number
  limit: number
  total: number
  onOffsetChange: (offset: number) => void
}

export function Pagination({ offset, limit, total, onOffsetChange }: Props) {
  const { t } = useTranslation('admin')

  if (total <= limit) return null

  const hasPrev = offset > 0
  const hasNext = offset + limit < total

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">
        {offset + 1}-{Math.min(offset + limit, total)} / {total}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!hasPrev}
          onClick={() => onOffsetChange(Math.max(0, offset - limit))}
        >
          {t('common.previous')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!hasNext}
          onClick={() => onOffsetChange(offset + limit)}
        >
          {t('common.next')}
        </Button>
      </div>
    </div>
  )
}
