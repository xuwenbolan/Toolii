import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

export function SimplePagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}) {
  const { t } = useTranslation('hub')

  if (total <= pageSize) return null

  const offset = (page - 1) * pageSize

  return (
    <div className="flex items-center justify-between pt-2 text-sm">
      <span className="text-muted-foreground">
        {offset + 1}-{Math.min(offset + pageSize, total)} / {total}
      </span>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          {t('previous')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={offset + pageSize >= total}
          onClick={() => onPageChange(page + 1)}
        >
          {t('next')}
        </Button>
      </div>
    </div>
  )
}
