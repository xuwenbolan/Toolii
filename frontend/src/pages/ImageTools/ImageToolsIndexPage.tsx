import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { SEOHead } from '@/components/common/SEOHead'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const TOOLS = [
  { key: 'compress', to: '/image-tools/compress' },
  { key: 'heicToJpg', to: '/image-tools/heic-to-jpg' },
  { key: 'convert', to: '/image-tools/convert' },
  { key: 'mosaic', to: '/image-tools/mosaic' },
  { key: 'scanEnhance', to: '/image-tools/scan-enhance' },
  { key: 'batch', to: '/image-tools/batch' },
] as const

export function ImageToolsIndexPage() {
  const { t } = useTranslation('tools')

  return (
    <>
      <SEOHead title={t('seoTitle')} description={t('seoDescription')} keywords={t('seoKeywords')} canonicalPath="/image-tools" />
      <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {TOOLS.map((item) => (
          <Link key={item.key} to={item.to} className="block">
            <Card className="transition hover:bg-accent/40">
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
