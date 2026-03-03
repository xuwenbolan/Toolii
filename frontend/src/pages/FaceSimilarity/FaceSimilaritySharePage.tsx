import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, Clock, Sparkles } from 'lucide-react'

import { SEOHead } from '@/components/common/SEOHead'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { FaceSimilarityResponse } from '@/services/faceMapApi'
import { getFaceMapShare, type FaceMapShareData } from '@/services/faceMapApi'

import { OverallScoreRing } from './components/OverallScoreRing'
import { RegionBar } from './components/RegionBar'

function formatExpiry(dateStr: string, locale: string): string {
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr
  return date.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })
}

function ShareSkeleton() {
  return (
    <div className="mx-auto w-full max-w-lg space-y-6 px-4 py-8">
      <div className="flex justify-center">
        <div className="h-32 w-32 animate-pulse rounded-full bg-muted/40" />
      </div>
      <div className="h-6 w-48 mx-auto animate-pulse rounded bg-muted/30" />
      <div className="flex justify-center gap-4">
        <div className="h-20 w-20 animate-pulse rounded-full bg-muted/40" />
        <div className="h-20 w-20 animate-pulse rounded-full bg-muted/40" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl bg-muted/30" />
        ))}
      </div>
    </div>
  )
}

function ShareError({ type }: { type: 'expired' | 'notFound' }) {
  const { t } = useTranslation('faceSimilarity')

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="text-center space-y-4">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted/40">
          <Clock className="h-7 w-7 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold">
          {type === 'expired' ? t('sharePage.expired') : t('sharePage.notFound')}
        </h2>
        <Button asChild variant="outline">
          <Link to="/face-similarity">
            {t('sharePage.cta')}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  )
}

export function FaceSimilaritySharePage() {
  const { token } = useParams<{ token: string }>()
  const { t, i18n } = useTranslation('faceSimilarity')
  const [data, setData] = useState<FaceMapShareData | null>(null)
  const [error, setError] = useState<'expired' | 'notFound' | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) {
      setError('notFound')
      setLoading(false)
      return
    }
    getFaceMapShare(token)
      .then(setData)
      .catch((err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status
        setError(status === 410 ? 'expired' : 'notFound')
      })
      .finally(() => setLoading(false))
  }, [token])

  // Temporarily switch locale to match the share data
  useEffect(() => {
    if (!data?.locale || data.locale === i18n.language) return
    const prevLang = i18n.language
    void i18n.changeLanguage(data.locale)
    return () => {
      void i18n.changeLanguage(prevLang)
    }
  }, [data?.locale, i18n])

  const result = useMemo(() => {
    if (!data) return null
    try {
      return JSON.parse(data.result_json) as FaceSimilarityResponse
    } catch {
      return null
    }
  }, [data])

  const imageUrl = data?.image_url ?? null
  const ogImageUrl = data ? `${window.location.origin}${data.image_url}` : undefined

  const regionLabels: Record<string, string> = {
    eyes: t('result.eyes'),
    nose: t('result.nose'),
    mouth: t('result.mouth'),
    jawline: t('result.jawline'),
    overall_face: t('result.overall_face'),
  }

  if (loading) {
    return (
      <>
        <SEOHead title={t('sharePage.title')} description={t('sharePage.description')} noindex />
        <ShareSkeleton />
      </>
    )
  }

  if (error || !result) {
    return (
      <>
        <SEOHead title={t('sharePage.title')} description={t('sharePage.description')} noindex />
        <ShareError type={error ?? 'notFound'} />
      </>
    )
  }

  return (
    <>
      <SEOHead
        title={t('sharePage.title')}
        description={result.summary.slice(0, 160)}
        canonicalPath={`/face-similarity/share/${token}`}
        ogImage={ogImageUrl}
        noindex
      />

      {/* Atmospheric background */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-blue-200/20 blur-3xl dark:bg-blue-800/10" />
        <div className="absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-violet-200/15 blur-3xl dark:bg-violet-900/10" />
        <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-stone-200/20 blur-3xl dark:bg-stone-800/10" />
      </div>

      <article className="mx-auto w-full max-w-lg px-4 pb-16 pt-6">
        {/* Header badge */}
        <div className="mb-5 flex items-center justify-center gap-2">
          <Badge variant="secondary" className="gap-1.5 px-3 py-1 text-xs font-medium">
            <Sparkles className="h-3 w-3" />
            {t('sharePage.badge')}
          </Badge>
        </div>

        <div className="space-y-6">
          {/* Overall score */}
          <div className="flex flex-col items-center gap-3 py-4">
            <OverallScoreRing score={result.overall_score} />
            <h2 className="text-lg sm:text-xl font-bold text-center">{result.title}</h2>
            <p className="text-sm text-muted-foreground text-center max-w-md">{result.summary}</p>
          </div>

          {/* Composite image */}
          {imageUrl && (
            <div className="flex justify-center">
              <div className="overflow-hidden rounded-2xl shadow-lg shadow-stone-900/10 dark:shadow-stone-950/30">
                <img
                  src={imageUrl}
                  alt="Face comparison"
                  className="block w-full max-w-xs rounded-2xl object-cover"
                  loading="eager"
                />
              </div>
            </div>
          )}

          {/* Region comparison bars */}
          <div
            className={cn(
              'rounded-2xl p-5 shadow-sm',
              'bg-gradient-to-b from-stone-50/80 to-white dark:from-stone-900/30 dark:to-card',
              'ring-1 ring-border/40',
            )}
          >
            <h3 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {t('result.regions')}
            </h3>
            <div className="space-y-4">
              {result.regions.map((r, i) => (
                <RegionBar
                  key={r.region}
                  region={r.region}
                  label={regionLabels[r.region] ?? r.region}
                  score={r.score}
                  description={r.description}
                  delay={i * 100}
                />
              ))}
            </div>
          </div>

          {/* Disclaimer */}
          <p className="text-xs text-muted-foreground/70 text-center">
            {result.disclaimer}
          </p>
        </div>

        {/* CTA */}
        <section className="mt-8 mb-8">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-stone-100 via-blue-50/70 to-violet-50/50 dark:from-stone-900 dark:via-blue-950/40 dark:to-violet-950/25 p-6 text-center shadow-sm">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-30 [background:radial-gradient(circle_at_bottom_left,rgba(100,140,200,0.25),transparent_60%)]"
            />
            <div className="relative space-y-3">
              <h3 className="text-base font-semibold">{t('sharePage.cta')}</h3>
              <p className="text-sm text-muted-foreground">{t('sharePage.ctaDescription')}</p>
              <Button asChild size="lg" className="mt-2">
                <Link to="/face-similarity">
                  {t('sharePage.cta')}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="space-y-2 text-center">
          {data?.expires_at && (
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground/70">
              <Clock className="h-3 w-3" />
              {t('sharePage.expiresAt', { date: formatExpiry(data.expires_at, i18n.language) })}
            </p>
          )}
        </footer>
      </article>
    </>
  )
}
