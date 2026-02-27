import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SEOHead } from '@/components/common/SEOHead'

const TOOLS = [
  { key: 'compress', to: '/pdf-tools/compress' },
  { key: 'merge', to: '/pdf-tools/merge' },
  { key: 'pages', to: '/pdf-tools/pages' },
  { key: 'imagesToPdf', to: '/pdf-tools/from-images' },
] as const

export function PdfToolsPage() {
  const { t } = useTranslation('tools')

  return (
    <>
      <SEOHead title={t('pdf.seoTitle')} description={t('pdf.seoDescription')} keywords={t('pdf.seoKeywords')} canonicalPath="/pdf-tools" />
      <div className="space-y-5">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">{t('pdf.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('pdf.subtitle')}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {TOOLS.map((item) => (
            <Link key={item.key} to={item.to} className="block">
              <Card className="transition hover:bg-accent/40">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{t(`pdf.${item.key}.title`)}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {t(`pdf.${item.key}.indexDescription`)}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
