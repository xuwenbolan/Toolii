import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, Clock, Sparkles } from 'lucide-react'

import { SEOHead } from '@/components/common/SEOHead'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { FaceProfileResponse, FullReportResponse } from '@/services/faceMapApi'
import { getFaceMapShare, type FaceMapShareData } from '@/services/faceMapApi'

import { AestheticsRadar } from './components/AestheticsRadar'
import { AllInsights } from './components/AllInsights'
import { ContouringGuide } from './components/ContouringGuide'
import { DimensionBasisDetail } from './components/DimensionBasisDetail'
import { EyebrowComparison } from './components/EyebrowComparison'
import { FeatureGrid } from './components/FeatureGrid'
import { FunIndicesPanel } from './components/FunIndicesPanel'
import { GeneCard } from './components/GeneCard'
import { GlassesCard } from './components/GlassesCard'
import { HairstyleCard } from './components/HairstyleCard'
import { PhysiognomyNarrative } from './components/PhysiognomyNarrative'
import { PhotoAngleCard } from './components/PhotoAngleCard'
import { ScoreRing } from './components/ScoreRing'
import { TagPills } from './components/TagPills'

type ParsedResult =
  | { type: 'profile'; profile: FaceProfileResponse }
  | { type: 'report'; report: FullReportResponse; profile: FaceProfileResponse }

function parseResult(data: FaceMapShareData): ParsedResult {
  const json = JSON.parse(data.result_json)
  if (data.share_type === 'report') {
    return { type: 'report', report: json as FullReportResponse, profile: (json as FullReportResponse).profile }
  }
  return { type: 'profile', profile: json as FaceProfileResponse }
}

function formatExpiry(dateStr: string, locale: string): string {
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr
  return date.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })
}

// -- Loading skeleton --

function ShareSkeleton() {
  return (
    <div className="mx-auto w-full max-w-lg space-y-6 px-4 py-8">
      <div className="mx-auto aspect-[3/4] w-64 animate-pulse rounded-2xl bg-muted/40" />
      <div className="flex justify-center gap-6">
        <div className="h-24 w-24 animate-pulse rounded-full bg-muted/40" />
        <div className="h-40 w-40 animate-pulse rounded-xl bg-muted/30" />
      </div>
      <div className="h-32 animate-pulse rounded-xl bg-muted/30" />
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-6 w-20 animate-pulse rounded-full bg-muted/30" />
        ))}
      </div>
    </div>
  )
}

// -- Error / expired state --

function ShareError({ type }: { type: 'expired' | 'notFound' }) {
  const { t } = useTranslation('faceMap')

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
          <Link to="/facemap">
            {t('sharePage.cta')}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  )
}

// -- Main share page --

export function FaceMapSharePage() {
  const { token } = useParams<{ token: string }>()
  const { t, i18n } = useTranslation('faceMap')
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

  // Temporarily switch locale to match the share data, restore on unmount
  useEffect(() => {
    if (!data?.locale || data.locale === i18n.language) return
    const prevLang = i18n.language
    void i18n.changeLanguage(data.locale)
    return () => {
      void i18n.changeLanguage(prevLang)
    }
  }, [data?.locale, i18n])

  const parsed = useMemo(() => {
    if (!data) return null
    try {
      return parseResult(data)
    } catch {
      return null
    }
  }, [data])

  const profileData = parsed?.profile ?? null
  const isReport = parsed?.type === 'report'
  const reportData = isReport ? (parsed as Extract<ParsedResult, { type: 'report' }>).report : null
  const imageUrl = data?.image_url ?? null

  // OG image as absolute URL
  const ogImageUrl = data ? `${window.location.origin}${data.image_url}` : undefined

  if (loading) {
    return (
      <>
        <SEOHead title={t('sharePage.title')} description={t('sharePage.description')} noindex />
        <ShareSkeleton />
      </>
    )
  }

  if (error || !profileData) {
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
        description={profileData.gene_card.description.slice(0, 160)}
        canonicalPath={`/facemap/share/${token}`}
        ogImage={ogImageUrl}
        noindex
      />

      {/* Atmospheric background */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-amber-200/20 blur-3xl dark:bg-amber-800/10" />
        <div className="absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-rose-200/15 blur-3xl dark:bg-rose-900/10" />
        <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-stone-200/20 blur-3xl dark:bg-stone-800/10" />
      </div>

      <article className="mx-auto w-full max-w-lg px-4 pb-16 pt-6">
        {/* Header badge */}
        <div className="mb-5 flex items-center justify-center gap-2">
          <Badge variant="secondary" className="gap-1.5 px-3 py-1 text-xs font-medium">
            <Sparkles className="h-3 w-3" />
            {isReport ? t('sharePage.sharedReport') : t('sharePage.sharedProfile')}
          </Badge>
        </div>

        {/* Hero photo */}
        {imageUrl && (
          <div className="mb-8 flex justify-center">
            <div className="relative overflow-hidden rounded-2xl shadow-xl shadow-stone-900/10 dark:shadow-stone-950/30">
              <img
                src={imageUrl}
                alt="FaceMap"
                className="block max-h-[400px] w-auto rounded-2xl object-cover"
                loading="eager"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/20 to-transparent"
              />
            </div>
          </div>
        )}

        <div className="space-y-5">
          {/* Gene Card */}
          <GeneCard data={profileData.gene_card} />

          {/* Score + Radar + Dimensions + Tags */}
          <div
            className={cn(
              'flex flex-col items-center gap-4 rounded-2xl p-5 text-center shadow-sm',
              'bg-gradient-to-b from-stone-50/80 to-white dark:from-stone-900/30 dark:to-card',
              'ring-1 ring-border/40',
            )}
          >
            <div className="flex items-center gap-6 flex-wrap justify-center">
              <div className="flex flex-col items-center gap-1">
                <ScoreRing score={profileData.overall_score} />
                <span className="text-xs font-medium text-muted-foreground">{t('profile.overallScore')}</span>
              </div>
              {profileData.dimensions.length > 0 && (
                <AestheticsRadar dimensions={profileData.dimensions} />
              )}
            </div>

            {profileData.dimensions.length > 0 && (
              <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5">
                {profileData.dimensions.map((d) => (
                  <span key={d.id} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    {d.label}:
                    <span className="font-semibold text-foreground tabular-nums">{d.percentile}%</span>
                  </span>
                ))}
              </div>
            )}

            {profileData.dimensions.length > 0 && (
              <DimensionBasisDetail dimensions={profileData.dimensions} />
            )}

            <TagPills tags={profileData.tags} />
          </div>

          {/* Fun Indices */}
          {profileData.fun_indices.length > 0 && (
            <FunIndicesPanel indices={profileData.fun_indices} />
          )}

          {/* Feature Grid */}
          {Object.keys(profileData.features).length > 0 && (
            <FeatureGrid features={profileData.features} highlightedFeature={null} onFeatureClick={() => {}} />
          )}

          {/* Photo Angle */}
          <PhotoAngleCard data={profileData.photo_angle} />

          {/* Summary */}
          <div
            className={cn(
              'rounded-2xl p-5 shadow-sm ring-1 ring-border/30',
              'bg-gradient-to-br from-amber-50/40 via-stone-50/60 to-rose-50/30',
              'dark:from-amber-950/10 dark:via-stone-900/20 dark:to-rose-950/10',
            )}
          >
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('profile.summary')}
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{profileData.summary}</p>
          </div>

          {/* Paid report sections */}
          {reportData && (
            <>
              <HairstyleCard data={reportData.hairstyles} />
              <EyebrowComparison data={reportData.eyebrows} />
              <ContouringGuide data={reportData.contouring} />
              <GlassesCard data={reportData.glasses} />
              <AllInsights insights={reportData.insights} />
              <PhysiognomyNarrative sections={reportData.physiognomy_sections} llmUsed={reportData.llm_used} />
            </>
          )}
        </div>

        {/* CTA */}
        <section className="mt-8 mb-8">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-stone-100 via-amber-50/70 to-rose-50/50 dark:from-stone-900 dark:via-amber-950/40 dark:to-rose-950/25 p-6 text-center shadow-sm">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-30 [background:radial-gradient(circle_at_bottom_left,rgba(180,140,100,0.25),transparent_60%)]"
            />
            <div className="relative space-y-3">
              <h3 className="text-base font-semibold">{t('sharePage.cta')}</h3>
              <p className="text-sm text-muted-foreground">{t('sharePage.ctaDescription')}</p>
              <Button asChild size="lg" className="mt-2">
                <Link to="/facemap">
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
          <p className="text-[11px] text-muted-foreground/50 italic">{profileData.disclaimer}</p>
        </footer>
      </article>
    </>
  )
}
