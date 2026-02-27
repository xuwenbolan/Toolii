import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { SEOHead } from '@/components/common/SEOHead'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  const { t } = useTranslation('common')

  return (
    <div className="space-y-4 py-16 text-center">
      <SEOHead title={t('notFound.seoTitle')} description={t('notFound.description')} noindex />
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">404</p>
        <h1 className="text-xl font-semibold tracking-tight">{t('notFound.title')}</h1>
      </div>
      <Link to="/">
        <Button>{t('notFound.backHome')}</Button>
      </Link>
    </div>
  )
}
