import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SEOHead } from '@/components/common/SEOHead'

export function ProcessingHistoryPage() {
  const { t } = useTranslation('credits')

  return (
    <>
      <SEOHead title={t('processingHistory.seoTitle')} noindex />
      <Card>
      <CardHeader>
        <CardTitle>{t('processingHistory.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>{t('processingHistory.placeholder')}</p>
        <p>{t('processingHistory.description')}</p>
      </CardContent>
    </Card>
    </>
  )
}
