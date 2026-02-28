import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { SEOHead } from '@/components/common/SEOHead'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FORMAT_PAIRS } from '@/config/formatPairs'
import { buildToolJsonLd } from '@/lib/jsonLd'
import { ConvertForm } from './ConvertForm'

export function ConvertPage() {
  const { t } = useTranslation('tools')

  return (
    <>
      <SEOHead
        title={t('convert.seoTitle')}
        description={t('convert.seoDescription')}
        keywords={t('convert.seoKeywords')}
        canonicalPath="/image-tools/convert"
        jsonLd={buildToolJsonLd({ name: t('convert.seoTitle'), description: t('convert.seoDescription'), url: '/image-tools/convert' })}
      />
      <ConvertForm title={t('convert.title')} description={t('convert.description')} />

      <div className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold">{t('convert.title')}</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {FORMAT_PAIRS.map((pair) => (
            <Link key={pair.slug} to={`/image-tools/${pair.slug}`} className="block">
              <Card className="transition hover:bg-accent/40">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{t(`${pair.i18nKey}.title`)}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {t(`${pair.i18nKey}.indexDescription`)}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
