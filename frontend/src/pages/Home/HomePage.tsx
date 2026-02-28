import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { SEOHead } from '@/components/common/SEOHead'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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
  {
    titleKey: 'home.textTools',
    descKey: 'home.textToolsDesc',
    to: '/text-tools',
  },
  {
    titleKey: 'home.fileTransfer',
    descKey: 'home.fileTransferDesc',
    to: '/transfer',
  },
]

const TRUST_KEYS = ['home.trustLocal', 'home.trustFree', 'home.trustNoSignup'] as const

export function HomePage() {
  const { t } = useTranslation('common')

  return (
    <div className="space-y-8">
      <SEOHead
        title={t('home.seoTitle')}
        description={t('home.seoDescription')}
        canonicalPath="/"
        keywords={t('home.seoKeywords')}
      />

      {/* Hero */}
      <div className="animate-fade-in space-y-3 pt-2">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {t('home.title')}
        </h1>
        <p className="max-w-xl text-base text-muted-foreground">
          {t('home.subtitle')}
        </p>
      </div>

      {/* Trust indicators */}
      <div className="animate-fade-in-delay-1 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
        {TRUST_KEYS.map((key) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
            {t(key)}
          </span>
        ))}
      </div>

      {/* Tool category cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {TOOL_CATEGORIES.map((item, i) => (
          <Link
            key={item.titleKey}
            to={item.to}
            className="group block h-full"
            style={{ animationDelay: `${(i + 1) * 80}ms` }}
          >
            <Card
              className="animate-card-in h-full transition-all duration-200 ease-out group-hover:-translate-y-1 group-hover:shadow-md"
              style={{ animationDelay: `${(i + 1) * 80}ms` }}
            >
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
