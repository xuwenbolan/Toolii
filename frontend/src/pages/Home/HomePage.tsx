import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { SEOHead } from '@/components/common/SEOHead'
import { buildWebSiteJsonLd } from '@/lib/jsonLd'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToolStore } from '@/stores/toolStore'

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
    toolName: 'pdf/tools',
  },
  {
    titleKey: 'home.wordTools',
    descKey: 'home.wordToolsDesc',
    to: '/word-tools',
    toolName: 'docx/tools',
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
  {
    titleKey: 'home.docsEditor',
    descKey: 'home.docsEditorDesc',
    to: '/dashboard/hub',
  },
  {
    titleKey: 'home.faceMap',
    descKey: 'home.faceMapDesc',
    to: '/facemap',
    toolName: 'facemap/profile',
  },
  {
    titleKey: 'home.faceSimilarity',
    descKey: 'home.faceSimilarityDesc',
    to: '/face-similarity',
    toolName: 'facemap/similarity',
  },
]

const TRUST_KEYS = ['home.trustLocal', 'home.trustFree', 'home.trustNoSignup'] as const

export function HomePage() {
  const { t } = useTranslation('common')
  const { isToolEnabled, loaded } = useToolStore()

  const visibleCategories = loaded
    ? TOOL_CATEGORIES.filter((c) => !c.toolName || isToolEnabled(c.toolName))
    : TOOL_CATEGORIES

  return (
    <div className="space-y-8">
      <SEOHead
        title={t('home.seoTitle')}
        description={t('home.seoDescription')}
        canonicalPath="/"
        keywords={t('home.seoKeywords')}
        jsonLd={buildWebSiteJsonLd()}
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
        {visibleCategories.map((item) => (
          <Link
            key={item.titleKey}
            to={item.to}
            className="group block h-full"
          >
            <Card className="h-full transition-colors hover:bg-muted/50">
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
