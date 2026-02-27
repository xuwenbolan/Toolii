import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { SEOHead } from '@/components/common/SEOHead'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// Translation keys for tool categories
const TOOL_CATEGORIES = [
  {
    titleKey: 'home.idPhoto',
    descKey: 'home.idPhotoDesc',
    to: '/id-photo',
  },
  {
    titleKey: 'home.imageTools',
    descKey: 'home.imageToolsDesc',
    to: '/image-tools',
  },
  {
    titleKey: 'home.pdfTools',
    descKey: 'home.pdfToolsDesc',
    to: '/pdf-tools',
  },
]

export function HomePage() {
  const { t } = useTranslation('common')

  return (
    <div className="space-y-5">
      <SEOHead
        title={t('home.seoTitle')}
        description={t('home.seoDescription')}
        canonicalPath="/"
        keywords={t('home.seoKeywords')}
      />
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('home.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('home.subtitle')}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {TOOL_CATEGORIES.map((item) => (
          <Link key={item.titleKey} to={item.to} className="block h-full">
            <Card className="h-full transition hover:bg-accent/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{t(item.titleKey)}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {t(item.descKey)}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
