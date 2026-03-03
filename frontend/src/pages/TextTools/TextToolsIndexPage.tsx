import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

import { SEOHead } from '@/components/common/SEOHead'
import { buildBreadcrumbJsonLd } from '@/lib/jsonLd'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const TOOLS = [
  { key: 'wordCounter', to: '/text-tools/word-counter' },
] as const

export function TextToolsIndexPage() {
  const { t } = useTranslation(['textTools', 'common'])

  return (
    <>
      <SEOHead
        title={t('seoTitle')}
        description={t('seoDescription')}
        keywords={t('seoKeywords')}
        canonicalPath="/text-tools"
        jsonLd={buildBreadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: t('title'), path: '/text-tools' }])}
      />
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="h-8 w-fit px-2.5">
            <Link to="/" className="inline-flex items-center gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              <span>{t('common:actions.back')}</span>
            </Link>
          </Button>
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl">{t('title')}</h1>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {TOOLS.map((item, index) => (
            <Link
              key={item.key}
              to={item.to}
              className="block"
              style={{ animationDelay: `${100 + index * 60}ms` }}
            >
              <Card className="h-full transition hover:bg-accent/40">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{t(`${item.key}.title`)}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {t(`${item.key}.indexDescription`)}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
