import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, Clock, Sparkles } from 'lucide-react'

import { SEOHead } from '@/components/common/SEOHead'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { FaceProfileResponse, FullReportResponse, FaceSimilarityResponse } from '@/services/faceMapApi'
import { getResultShare, type ResultShareData } from '@/services/resultShareApi'

import { ImageToolShareView } from './ImageToolShareView'

// FaceMap components (lazy-imported from FaceMap page)
import { AestheticsRadar } from '../FaceMap/components/AestheticsRadar'
import { AllInsights } from '../FaceMap/components/AllInsights'
import { ContouringGuide } from '../FaceMap/components/ContouringGuide'
import { DimensionBasisDetail } from '../FaceMap/components/DimensionBasisDetail'
import { EyebrowComparison } from '../FaceMap/components/EyebrowComparison'
import { FeatureGrid } from '../FaceMap/components/FeatureGrid'
import { FunIndicesPanel } from '../FaceMap/components/FunIndicesPanel'
import { GeneCard } from '../FaceMap/components/GeneCard'
import { GlassesCard } from '../FaceMap/components/GlassesCard'
import { HairstyleCard } from '../FaceMap/components/HairstyleCard'
import { PhysiognomyNarrative } from '../FaceMap/components/PhysiognomyNarrative'
import { PhotoAngleCard } from '../FaceMap/components/PhotoAngleCard'
import { ScoreRing } from '../FaceMap/components/ScoreRing'
import { TagPills } from '../FaceMap/components/TagPills'

// Face similarity components
import { OverallScoreRing } from '../FaceSimilarity/components/OverallScoreRing'
import { RegionBar } from '../FaceSimilarity/components/RegionBar'
import { NarrativeCard } from '../FaceSimilarity/components/NarrativeCard'
import { FunFactCards } from '../FaceSimilarity/components/FunFactCards'

const FACEMAP_TYPES = new Set(['profile', 'report'])
const IMAGE_TOOL_TYPES = new Set([
  'compress', 'remove_bg', 'upscale', 'restore_face',
  'denoise', 'colorize', 'inpaint', 'scan_enhance', 'mosaic',
])

function formatExpiry(dateStr: string, locale: string): string {
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr
  return date.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })
}

function ShareSkeleton() {
  return (
    <div className="mx-auto w-full max-w-lg space-y-6 px-4 py-8">
      <div className="mx-auto aspect-[3/4] w-64 animate-pulse rounded-2xl bg-muted/40" />
      <div className="flex justify-center gap-6">
        <div className="h-24 w-24 animate-pulse rounded-full bg-muted/40" />
        <div className="h-40 w-40 animate-pulse rounded-xl bg-muted/30" />
      </div>
      <div className="h-32 animate-pulse rounded-xl bg-muted/30" />
    </div>
  )
}

function ShareError({ type }: { type: 'expired' | 'notFound' }) {
  const { t } = useTranslation('resultShare')

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="text-center space-y-4">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted/40">
          <Clock className="h-7 w-7 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold">
          {type === 'expired' ? t('expired') : t('notFound')}
        </h2>
        <Button asChild variant="outline">
          <Link to="/">
            <ArrowRight className="mr-2 h-4 w-4" />
            Toolii
          </Link>
        </Button>
      </div>
    </div>
  )
}

// -- FaceMap profile/report view (extracted from old FaceMapSharePage) --

function FaceMapShareView({ data }: { data: ResultShareData }) {
  const { t, i18n } = useTranslation(['faceMap', 'resultShare'])

  const parsed = useMemo(() => {
    try {
      const json = JSON.parse(data.result_json)
      if (data.share_type === 'report') {
        return { type: 'report' as const, report: json as FullReportResponse, profile: (json as FullReportResponse).profile }
      }
      return { type: 'profile' as const, profile: json as FaceProfileResponse }
    } catch {
      return null
    }
  }, [data])

  if (!parsed) return <ShareError type="notFound" />

  const profile = parsed.profile
  const isReport = parsed.type === 'report'
  const reportData = isReport ? (parsed as { type: 'report'; report: FullReportResponse }).report : null

  return (
    <article className="mx-auto w-full max-w-lg px-4 pb-16 pt-6">
      <div className="mb-5 flex items-center justify-center gap-2">
        <Badge variant="secondary" className="gap-1.5 px-3 py-1 text-xs font-medium">
          <Sparkles className="h-3 w-3" />
          {t(`resultShare:badge.${data.share_type}`)}
        </Badge>
      </div>

      {data.image_url && (
        <div className="mb-8 flex justify-center">
          <div className="relative overflow-hidden rounded-2xl shadow-xl shadow-stone-900/10 dark:shadow-stone-950/30">
            <img src={data.image_url} alt="FaceMap" className="block max-h-[400px] w-auto rounded-2xl object-cover" loading="eager" />
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/20 to-transparent" />
          </div>
        </div>
      )}

      <div className="space-y-5">
        <GeneCard data={profile.gene_card} />

        <div className={cn(
          'flex flex-col items-center gap-4 rounded-2xl p-5 text-center shadow-sm',
          'bg-gradient-to-b from-stone-50/80 to-white dark:from-stone-900/30 dark:to-card',
          'ring-1 ring-border/40',
        )}>
          <div className="flex items-center gap-6 flex-wrap justify-center">
            <div className="flex flex-col items-center gap-1">
              <ScoreRing score={profile.overall_score} />
              <span className="text-xs font-medium text-muted-foreground">{t('faceMap:profile.overallScore')}</span>
            </div>
            {profile.dimensions.length > 0 && <AestheticsRadar dimensions={profile.dimensions} />}
          </div>
          {profile.dimensions.length > 0 && (
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5">
              {profile.dimensions.map((d) => (
                <span key={d.id} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  {d.label}: <span className="font-semibold text-foreground tabular-nums">{d.percentile}%</span>
                </span>
              ))}
            </div>
          )}
          {profile.dimensions.length > 0 && <DimensionBasisDetail dimensions={profile.dimensions} />}
          <TagPills tags={profile.tags} />
        </div>

        {profile.fun_indices.length > 0 && <FunIndicesPanel indices={profile.fun_indices} />}
        {Object.keys(profile.features).length > 0 && (
          <FeatureGrid features={profile.features} highlightedFeature={null} onFeatureClick={() => {}} />
        )}
        <PhotoAngleCard data={profile.photo_angle} />

        <div className={cn(
          'rounded-2xl p-5 shadow-sm ring-1 ring-border/30',
          'bg-gradient-to-br from-amber-50/40 via-stone-50/60 to-rose-50/30',
          'dark:from-amber-950/10 dark:via-stone-900/20 dark:to-rose-950/10',
        )}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('faceMap:profile.summary')}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{profile.summary}</p>
        </div>

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

      <section className="mt-8 mb-8">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-stone-100 via-amber-50/70 to-rose-50/50 dark:from-stone-900 dark:via-amber-950/40 dark:to-rose-950/25 p-6 text-center shadow-sm">
          <div className="relative space-y-3">
            <h3 className="text-base font-semibold">{t(`resultShare:cta.${data.share_type}`)}</h3>
            <p className="text-sm text-muted-foreground">{t(`resultShare:ctaDescription.${data.share_type}`)}</p>
            <Button asChild size="lg" className="mt-2">
              <Link to="/facemap">
                {t(`resultShare:cta.${data.share_type}`)}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="space-y-2 text-center">
        {data.expires_at && (
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground/70">
            <Clock className="h-3 w-3" />
            {t('resultShare:expiresAt', { date: formatExpiry(data.expires_at, i18n.language) })}
          </p>
        )}
        <p className="text-[11px] text-muted-foreground/50 italic">{profile.disclaimer}</p>
      </footer>
    </article>
  )
}

// -- Similarity view (extracted from old FaceSimilaritySharePage) --

function SimilarityShareView({ data }: { data: ResultShareData }) {
  const { t, i18n } = useTranslation(['faceSimilarity', 'resultShare'])

  const result = useMemo(() => {
    try {
      return JSON.parse(data.result_json) as FaceSimilarityResponse
    } catch {
      return null
    }
  }, [data])

  if (!result) return <ShareError type="notFound" />

  const regionLabels: Record<string, string> = {
    eyes: t('faceSimilarity:result.eyes'),
    nose: t('faceSimilarity:result.nose'),
    mouth: t('faceSimilarity:result.mouth'),
    jawline: t('faceSimilarity:result.jawline'),
    overall_face: t('faceSimilarity:result.overall_face'),
  }

  return (
    <article className="mx-auto w-full max-w-lg px-4 pb-16 pt-6">
      <div className="mb-5 flex items-center justify-center gap-2">
        <Badge variant="secondary" className="gap-1.5 px-3 py-1 text-xs font-medium">
          <Sparkles className="h-3 w-3" />
          {t('resultShare:badge.similarity')}
        </Badge>
      </div>

      <div className="space-y-6">
        <div className="flex flex-col items-center gap-3 py-4">
          <OverallScoreRing score={result.overall_score} />
          <h2 className="text-lg sm:text-xl font-bold text-center">{result.title}</h2>
          <p className="text-sm text-muted-foreground text-center max-w-md">{result.summary}</p>
        </div>

        {data.image_url && (
          <div className="flex justify-center">
            <div className="overflow-hidden rounded-2xl shadow-lg shadow-stone-900/10 dark:shadow-stone-950/30">
              <img src={data.image_url} alt="Face comparison" className="block w-full max-w-xs rounded-2xl object-cover" loading="eager" />
            </div>
          </div>
        )}

        <div className={cn(
          'rounded-2xl p-5 shadow-sm',
          'bg-gradient-to-b from-stone-50/80 to-white dark:from-stone-900/30 dark:to-card',
          'ring-1 ring-border/40',
        )}>
          <h3 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {t('faceSimilarity:result.regions')}
          </h3>
          <div className="space-y-4">
            {result.regions.map((r, i) => (
              <RegionBar key={r.region} region={r.region} label={regionLabels[r.region] ?? r.region} score={r.score} description={r.description} badge={r.badge} delay={i * 100} />
            ))}
          </div>
        </div>

        {result.narrative && <NarrativeCard narrative={result.narrative} />}

        {result.fun_facts && result.fun_facts.length > 0 && (
          <FunFactCards facts={result.fun_facts} />
        )}

        <p className="text-xs text-muted-foreground/70 text-center">{result.disclaimer}</p>
      </div>

      <section className="mt-8 mb-8">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-stone-100 via-blue-50/70 to-violet-50/50 dark:from-stone-900 dark:via-blue-950/40 dark:to-violet-950/25 p-6 text-center shadow-sm">
          <div className="relative space-y-3">
            <h3 className="text-base font-semibold">{t('resultShare:cta.similarity')}</h3>
            <p className="text-sm text-muted-foreground">{t('resultShare:ctaDescription.similarity')}</p>
            <Button asChild size="lg" className="mt-2">
              <Link to="/face-similarity">
                {t('resultShare:cta.similarity')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="text-center">
        {data.expires_at && (
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground/70">
            <Clock className="h-3 w-3" />
            {t('resultShare:expiresAt', { date: formatExpiry(data.expires_at, i18n.language) })}
          </p>
        )}
      </footer>
    </article>
  )
}

// -- Main page --

export function ResultSharePage() {
  const { token } = useParams<{ token: string }>()
  const { i18n } = useTranslation()
  const [data, setData] = useState<ResultShareData | null>(null)
  const [error, setError] = useState<'expired' | 'notFound' | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) {
      setError('notFound')
      setLoading(false)
      return
    }
    getResultShare(token)
      .then(setData)
      .catch((err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status
        setError(status === 410 ? 'expired' : 'notFound')
      })
      .finally(() => setLoading(false))
  }, [token])

  // Switch locale to match share data, restore on unmount
  useEffect(() => {
    if (!data?.locale) return
    const prevLang = i18n.language
    if (data.locale !== prevLang) {
      void i18n.changeLanguage(data.locale)
    }
    return () => {
      void i18n.changeLanguage(prevLang)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.locale])

  // Parse tool metadata for image tools — must be before early returns (hooks rules)
  const toolMeta = useMemo(() => {
    if (!data || !IMAGE_TOOL_TYPES.has(data.share_type)) return {}
    try {
      return JSON.parse(data.result_json) as Record<string, unknown>
    } catch {
      return {}
    }
  }, [data])

  if (loading) {
    return (
      <>
        <SEOHead title="Toolii" noindex />
        <ShareSkeleton />
      </>
    )
  }

  if (error || !data) {
    return (
      <>
        <SEOHead title="Toolii" noindex />
        <ShareError type={error ?? 'notFound'} />
      </>
    )
  }

  // Atmospheric background for FaceMap/similarity
  const showAtmosphere = FACEMAP_TYPES.has(data.share_type) || data.share_type === 'similarity'

  const ogImageUrl = `${window.location.origin}${data.image_url}`

  return (
    <>
      <SEOHead title="Toolii" description="" canonicalPath={`/r/${token}`} ogImage={ogImageUrl} noindex />

      {showAtmosphere && (
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-amber-200/20 blur-3xl dark:bg-amber-800/10" />
          <div className="absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-rose-200/15 blur-3xl dark:bg-rose-900/10" />
          <div className="absolute bottom-0 right-0 h-64 w-64 rounded-full bg-stone-200/20 blur-3xl dark:bg-stone-800/10" />
        </div>
      )}

      {FACEMAP_TYPES.has(data.share_type) && <FaceMapShareView data={data} />}
      {data.share_type === 'similarity' && <SimilarityShareView data={data} />}
      {IMAGE_TOOL_TYPES.has(data.share_type) && <ImageToolShareView data={data} meta={toolMeta} />}
    </>
  )
}
