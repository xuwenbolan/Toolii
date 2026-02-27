import { ArrowLeft, FileText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { SEOHead } from '@/components/common/SEOHead'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type LegalSection = {
  title: string
  paragraphs?: string[]
  bullets?: string[]
}

export function TermsPage() {
  const { t } = useTranslation('legal')
  const sections = t('terms.sections', { returnObjects: true }) as LegalSection[]

  return (
    <div className="space-y-5">
      <SEOHead
        title={t('terms.metaTitle')}
        description={t('terms.metaDescription')}
        canonicalPath="/legal/terms"
      />

      <div className="rounded-2xl border bg-gradient-to-br from-amber-50 to-orange-50 p-5 dark:from-slate-950 dark:to-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-1 text-xs text-muted-foreground">
              <FileText className="size-3.5" />
              {t('terms.badge')}
            </div>
            <h1 className="text-xl font-semibold tracking-tight">{t('terms.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('terms.subtitle')}</p>
            <p className="text-xs text-muted-foreground">{t('terms.lastUpdated')}</p>
          </div>
          <Button variant="ghost" size="sm" className="w-full sm:w-auto" asChild>
            <Link to="/">
              <ArrowLeft className="size-4" />
              {t('common:actions.backHome')}
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 p-5 text-sm leading-6 text-muted-foreground">
          <p>{t('terms.summary')}</p>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {sections.map((section) => (
          <Card key={section.title}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{section.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
              {(section.paragraphs ?? []).map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {(section.bullets ?? []).length > 0 ? (
                <ul className="list-disc space-y-1 pl-5">
                  {section.bullets?.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
