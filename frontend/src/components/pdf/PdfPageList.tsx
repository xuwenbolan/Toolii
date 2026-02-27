import { useTranslation } from 'react-i18next'

import { PdfPagePreview } from '@/components/pdf/PdfPagePreview'

type Props = {
  pages: number[]
}

export function PdfPageList({ pages }: Props) {
  const { t } = useTranslation('tools')

  if (pages.length === 0) return null

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{t('shared.parsedPages')}</p>
      <div className="flex flex-wrap gap-2">
        {pages.map((page, idx) => (
          <PdfPagePreview key={`${page}-${idx}`} page={page} />
        ))}
      </div>
    </div>
  )
}
