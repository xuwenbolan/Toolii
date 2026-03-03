import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ChevronUp, Lock } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { toast } from 'sonner'

import { SEOHead } from '@/components/common/SEOHead'
import { buildToolJsonLd, buildBreadcrumbJsonLd } from '@/lib/jsonLd'
import { ToolActionBar } from '@/components/tools/ToolActionBar'
import { ToolErrorBanner } from '@/components/tools/ToolErrorBanner'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { ToolWorkspaceDropzone } from '@/components/tools/ToolWorkspaceDropzone'
import { InsufficientCreditsDialog } from '@/components/credits/InsufficientCreditsDialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useCredits } from '@/hooks/useCredits'
import type { ToolErrorMeta } from '@/lib/toolErrors'
import type { ExtendedVisualization, FaceProfileResponse, FullReportResponse } from '@/services/faceMapApi'
import { createFaceMapShare } from '@/services/faceMapApi'

import { useFaceMapState } from './useFaceMapState'
import { AnnotationControls, type AnnotationLayers } from './components/AnnotationControls'
import { ShareDialog } from './components/ShareDialog'
import { AestheticsRadar } from './components/AestheticsRadar'
import { AllInsights } from './components/AllInsights'
import { ContouringGuide } from './components/ContouringGuide'
import { DimensionBasisDetail } from './components/DimensionBasisDetail'
import { EyebrowComparison } from './components/EyebrowComparison'
import { FaceAnnotation } from './components/FaceAnnotation'
import { FeaturePopover } from './components/FeaturePopover'
import { FeatureGrid } from './components/FeatureGrid'
import { FunIndicesPanel } from './components/FunIndicesPanel'
import { GeneCard } from './components/GeneCard'
import { GlassesCard } from './components/GlassesCard'
import { HairstyleCard } from './components/HairstyleCard'
import { LockedOverlayPreview } from './components/LockedOverlayPreview'
import { PhysiognomyNarrative } from './components/PhysiognomyNarrative'
import { PhotoAngleCard } from './components/PhotoAngleCard'
import { ReportSkeleton } from './components/ReportSkeleton'
import { ScoreRing } from './components/ScoreRing'
import { SectionNav } from './components/SectionNav'
import { TagPills } from './components/TagPills'

export function FaceMapPage() {
  const { t, i18n } = useTranslation(['faceMap', 'common'])
  const { isAuthenticated } = useAuth()
  const {
    file,
    profileResult,
    reportResult,
    reportPending,
    reportError,
    insufficientDialogOpen,
    pending,
    progress,
    error,
    errorMeta,
    inputPreviewUrl,
    hasResult,
    runState,
    visualization,
    highlightedFeature,
    setHighlightedFeature,
    setInsufficientDialogOpen,
    handleFileSelect,
    handleAnalyze,
    handleReportAnalyze,
    retry,
  } = useFaceMapState()

  const credits = useCredits({
    enabled: isAuthenticated,
    includeTransactions: isAuthenticated,
    transactionsLimit: 5,
  })

  // Share dialog state
  const [sharePending, setSharePending] = useState(false)
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [shareUrl, setShareUrl] = useState('')

  const profileData = reportResult?.profile ?? profileResult
  const hasPaidReport = Boolean(reportResult)
  const actionPending = pending || reportPending || sharePending
  const actionError = error ?? reportError ?? null
  const actionStatus = reportPending
    ? t('faceMap:report.generating')
    : sharePending
      ? t('faceMap:share.creating')
      : actionError ?? runState.statusText
  const actionProgress = pending ? progress : null

  const handleShare = async () => {
    if (!profileData || !file) return
    setSharePending(true)
    try {
      const shareType = hasPaidReport ? 'report' : 'profile'
      const resultData = hasPaidReport ? reportResult : profileResult
      const locale = i18n.language.startsWith('en') ? 'en' : 'zh-CN'
      const res = await createFaceMapShare(
        file,
        JSON.stringify(resultData),
        shareType as 'profile' | 'report',
        locale,
      )
      const url = res.share_url
      setShareUrl(url)
      // Try native share first (mobile), fall back to dialog
      if (navigator.share) {
        try {
          await navigator.share({ url, title: t('faceMap:title') })
          return
        } catch {
          // User cancelled or API failed — fall through to dialog
        }
      }
      setShareDialogOpen(true)
    } catch {
      toast.error(t('faceMap:share.createFailed'))
    } finally {
      setSharePending(false)
    }
  }

  return (
    <>
      <SEOHead
        title={t('faceMap:seo.title')}
        description={t('faceMap:seo.description')}
        keywords={t('faceMap:seo.keywords')}
        canonicalPath="/facemap"
        jsonLd={[
          buildToolJsonLd({ name: t('faceMap:seo.title'), description: t('faceMap:seo.description'), url: '/facemap' }),
          buildBreadcrumbJsonLd([
            { name: 'Home', path: '/' },
            { name: t('faceMap:seo.title'), path: '/facemap' },
          ]),
        ]}
      />

      {/* Upload phase */}
      {!hasResult && (
        <ToolPageShell
          title={t('faceMap:title')}
          description={t('faceMap:subtitle')}
          backTo="/"
          layout="compact"
          width="wide"
        >
          <ToolWorkspaceDropzone
            accept={{ 'image/*': [] }}
            multiple={false}
            maxFiles={1}
            onFiles={handleFileSelect}
            title={t('faceMap:upload.title')}
            hint={t('faceMap:upload.hint')}
          />
          <ToolErrorBanner error={error} errorMeta={errorMeta} onRetry={file ? () => retry() : undefined} />
        </ToolPageShell>
      )}

      {/* Results phase - mobile-first layout */}
      {hasResult && profileData && file && inputPreviewUrl && (
        <ResultsLayout
          profileData={profileData}
          reportResult={reportResult}
          reportPending={reportPending}
          reportError={reportError}
          isAuthenticated={isAuthenticated}
          file={file}
          inputPreviewUrl={inputPreviewUrl}
          visualization={visualization ?? undefined}
          highlightedFeature={highlightedFeature}
          onFeatureClick={setHighlightedFeature}
          onUnlockReport={handleReportAnalyze}
          error={error}
          errorMeta={errorMeta ?? undefined}
          retryFn={file ? () => retry() : undefined}
        />
      )}

      {/* Error without profile data */}
      {hasResult && !profileData && (
        <ToolPageShell title={t('faceMap:title')} backTo="/" layout="compact" width="wide">
          <ToolErrorBanner error={error} errorMeta={errorMeta} onRetry={file ? () => retry() : undefined} />
        </ToolPageShell>
      )}

      <ToolActionBar
        mode="manual"
        status={actionStatus}
        pending={actionPending}
        progress={actionProgress}
        error={actionError}
        done={runState.phase === 'done' && !actionPending}
        ctaLabel={hasResult ? t('faceMap:upload.reanalyze') : t('faceMap:upload.button')}
        ctaDisabled={!runState.canRun || actionPending}
        onCta={() => {
          if (hasResult) {
            handleFileSelect([])
          } else {
            void handleAnalyze()
          }
        }}
        secondaryCtaLabel={
          hasResult
            ? (sharePending ? t('faceMap:share.creating') : t('faceMap:share.button'))
            : undefined
        }
        secondaryCtaDisabled={actionPending}
        onSecondaryCta={hasResult ? () => void handleShare() : undefined}
        maxWidthClassName="max-w-6xl"
      />

      <ShareDialog
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        shareUrl={shareUrl}
      />

      <InsufficientCreditsDialog
        open={insufficientDialogOpen}
        onOpenChange={setInsufficientDialogOpen}
        requiredCredits={1}
        balance={credits.balance}
        actionLabel={t('faceMap:report.unlock')}
        transactions={credits.transactions}
        transactionsPending={credits.transactionsPending}
        transactionsError={credits.transactionsError}
        onRefreshBalance={() => void credits.refreshAll()}
        onRedeemed={() => void credits.refreshAll()}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Results layout - mobile-first, full-bleed image hero
// ---------------------------------------------------------------------------

function ResultsLayout({
  profileData,
  reportResult,
  reportPending,
  reportError,
  isAuthenticated,
  file,
  inputPreviewUrl,
  visualization,
  highlightedFeature,
  onFeatureClick,
  onUnlockReport,
  error,
  errorMeta,
  retryFn,
}: {
  profileData: FaceProfileResponse
  reportResult: FullReportResponse | null
  reportPending: boolean
  reportError: string | null
  isAuthenticated: boolean
  file: File
  inputPreviewUrl: string
  visualization?: ExtendedVisualization
  highlightedFeature: string | null
  onFeatureClick: (key: string | null) => void
  onUnlockReport: () => void
  error: string | null
  errorMeta?: ToolErrorMeta
  retryFn?: () => void
}) {
  const { t } = useTranslation(['faceMap', 'common'])
  const location = useLocation()
  const loginRedirect = encodeURIComponent(location.pathname + location.search)
  const hasPaidReport = Boolean(reportResult)

  // Auto-scroll to report section on unlock
  useEffect(() => {
    if (!reportResult) return
    const el = document.querySelector('[data-section-id="report"]')
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [reportResult])

  const navSections = useMemo(() => {
    const sections = PROFILE_SECTIONS.map((s) => ({
      id: s.id,
      label: t(`faceMap:${s.labelKey}`),
    }))
    if (reportResult) {
      sections.push({ id: 'report', label: t('faceMap:nav.report') })
    }
    return sections
  }, [t, reportResult])

  // Image annotation state
  const imgRef = useRef<HTMLImageElement>(null)
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null)
  const [layers, setLayers] = useState<AnnotationLayers>({
    contour: true,
    threeCourts: true,
    fiveEyes: true,
    keyPoints: true,
  })

  const handleToggle = (layer: keyof AnnotationLayers) => {
    setLayers((prev) => ({ ...prev, [layer]: !prev[layer] }))
  }

  const handleFeatureSelect = (key: string | null) => {
    if (key == null) {
      onFeatureClick(null)
      return
    }
    onFeatureClick(highlightedFeature === key ? null : key)
  }

  const popAnchor = useMemo(() => {
    if (!visualization || !highlightedFeature) return undefined
    return getFeatureAnchor(visualization, highlightedFeature)
  }, [visualization, highlightedFeature])

  const paidSummary = useMemo(() => {
    if (!highlightedFeature || !reportResult) return null
    return getFeaturePaidSummary(highlightedFeature, reportResult, t)
  }, [highlightedFeature, reportResult, t])

  // Scroll-to-top button state (mobile only)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const handleScroll = useCallback(() => {
    setShowScrollTop(window.scrollY > 600)
  }, [])
  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  return (
    <div className="mx-auto w-full max-w-6xl pb-28 motion-safe:animate-fade-in">
      {/* Compact header */}
      <div className="flex items-center gap-2 px-4 py-3 sm:px-6">
        <Button asChild variant="ghost" size="sm" className="h-8 w-fit px-2">
          <Link to="/" className="inline-flex items-center gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only sm:not-sr-only">{t('common:actions.back')}</span>
          </Link>
        </Button>
        <h1 className="text-lg font-semibold tracking-tight">{t('faceMap:title')}</h1>
      </div>

      {/* Error banner */}
      <div className="px-4 sm:px-6">
        <ToolErrorBanner error={error} errorMeta={errorMeta} onRetry={retryFn} />
      </div>

      {/* Responsive: single column mobile, split on desktop */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-5 lg:items-start lg:px-4 xl:px-6">
        {/* Image panel - full bleed on mobile, sticky card on desktop */}
        <div className="lg:sticky lg:top-16 space-y-3 motion-safe:animate-[section-in_0.4s_var(--ease-out)_0.1s_both]">
          <div className="relative overflow-hidden bg-stone-100/60 dark:bg-stone-900/40 lg:rounded-2xl lg:border lg:border-border/60 lg:shadow-sm">
            {/* Subtle top gradient for visual depth on mobile */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/[0.03] to-transparent dark:from-white/[0.02] lg:hidden z-[1]"
            />
            <div className="flex justify-center lg:p-1">
              <div className="relative inline-block w-full">
                <img
                  ref={imgRef}
                  src={inputPreviewUrl}
                  alt={file.name}
                  className="block w-full max-h-[55vh] lg:max-h-[60vh] object-contain lg:rounded-xl"
                  onLoad={() => {
                    if (imgRef.current) {
                      setImgNatural({ w: imgRef.current.naturalWidth, h: imgRef.current.naturalHeight })
                    }
                  }}
                />
                {visualization && imgNatural && (
                  <FaceAnnotation
                    viz={visualization}
                    imgW={imgNatural.w}
                    imgH={imgNatural.h}
                    highlightedFeature={highlightedFeature}
                    layers={layers}
                    onFeatureSelect={handleFeatureSelect}
                    showLockedPaidOverlay={Boolean(profileData) && !hasPaidReport && isAuthenticated}
                  />
                )}
                {highlightedFeature && profileData.features[highlightedFeature] && (
                  <FeaturePopover
                    featureKey={highlightedFeature}
                    feature={profileData.features[highlightedFeature]}
                    anchor={popAnchor}
                    paidSummary={paidSummary}
                    onClose={() => onFeatureClick(null)}
                  />
                )}
              </div>
            </div>
            {/* Bottom gradient for smooth transition on mobile */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-stone-100/60 to-transparent dark:from-stone-900/40 lg:hidden"
            />
          </div>

          {/* Annotation layer controls */}
          {visualization && (
            <div className="px-4 lg:px-0">
              <AnnotationControls layers={layers} onToggle={handleToggle} />
            </div>
          )}
        </div>

        {/* Results panel */}
        <div className="space-y-5 px-4 pt-5 sm:px-6 lg:px-0 lg:pt-0 motion-safe:animate-[section-in_0.4s_var(--ease-out)_0.2s_both]">
          <SectionNav sections={navSections} />

          <div className="space-y-5">
            {/* Gene Card */}
            <div data-section-id="gene">
              <GeneCard data={profileData.gene_card} />
            </div>

            {/* Score + Radar + Tags */}
            <div
              data-section-id="score"
              className={cn(
                'flex flex-col items-center gap-4 rounded-2xl p-5 text-center shadow-sm',
                'bg-gradient-to-b from-stone-50/80 to-white dark:from-stone-900/30 dark:to-card',
                'ring-1 ring-border/40',
              )}
            >
              <div className="flex items-center gap-6 flex-wrap justify-center">
                <div className="flex flex-col items-center gap-1">
                  <ScoreRing score={profileData.overall_score} />
                  <h3 className="text-xs font-medium text-muted-foreground">{t('faceMap:profile.overallScore')}</h3>
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
            <div data-section-id="funIndices">
              <FunIndicesPanel indices={profileData.fun_indices} />
            </div>

            {/* Feature Grid */}
            <div data-section-id="features">
              <FeatureGrid
                features={profileData.features}
                highlightedFeature={highlightedFeature}
                onFeatureClick={onFeatureClick}
              />
            </div>

            {/* Photo Angle */}
            <div data-section-id="photoAngle">
              <PhotoAngleCard data={profileData.photo_angle} />
            </div>

            {/* Summary */}
            <div
              data-section-id="summary"
              className={cn(
                'rounded-2xl p-5 shadow-sm ring-1 ring-border/30',
                'bg-gradient-to-br from-amber-50/40 via-stone-50/60 to-rose-50/30',
                'dark:from-amber-950/10 dark:via-stone-900/20 dark:to-rose-950/10',
              )}
            >
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('faceMap:profile.summary')}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{profileData.summary}</p>
            </div>

            {/* Disclaimer */}
            {profileData.disclaimer && (
              <p className="text-center text-[11px] text-muted-foreground/60 italic">{profileData.disclaimer}</p>
            )}

            {/* Paid Report Section */}
            {reportResult ? (
              <div data-section-id="report">
                <PaidReportResults data={reportResult} />
              </div>
            ) : reportPending ? (
              <ReportSkeleton />
            ) : (
              <div className="space-y-2">
                {reportError && (
                  <div className="flex items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5">
                    <p className="text-xs text-destructive flex-1 text-center">{reportError}</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => void onUnlockReport()}
                    >
                      {t('common:actions.retry')}
                    </Button>
                  </div>
                )}
                {!isAuthenticated ? (
                  <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-5 text-center">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">{t('faceMap:loginRequired')}</p>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link to={`/auth/login?redirect=${loginRedirect}`}>{t('faceMap:loginAction')}</Link>
                    </Button>
                  </div>
                ) : (
                  <LockedOverlayPreview
                    onUnlock={onUnlockReport}
                    pending={reportPending}
                    creditHint={t('faceMap:report.creditHint')}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scroll-to-top FAB (mobile only) */}
      {showScrollTop && (
        <button
          type="button"
          className="fixed right-4 z-30 rounded-full bg-background/90 p-2.5 shadow-md border border-border/50 backdrop-blur-sm lg:hidden motion-safe:animate-fade-in"
          style={{ bottom: 'calc(var(--sai-bottom) + 5rem)' }}
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Scroll to top"
        >
          <ChevronUp className="h-5 w-5" />
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section navigation items
// ---------------------------------------------------------------------------

const PROFILE_SECTIONS: { id: string; labelKey: string }[] = [
  { id: 'gene', labelKey: 'profile.geneCard' },
  { id: 'score', labelKey: 'profile.overallScore' },
  { id: 'funIndices', labelKey: 'profile.funIndices' },
  { id: 'features', labelKey: 'profile.features' },
  { id: 'photoAngle', labelKey: 'profile.photoAngle' },
  { id: 'summary', labelKey: 'profile.summary' },
]

// ---------------------------------------------------------------------------
// Paid report results
// ---------------------------------------------------------------------------

function PaidReportResults({ data }: { data: FullReportResponse }) {
  return (
    <div className="space-y-5">
      <HairstyleCard data={data.hairstyles} />
      <EyebrowComparison data={data.eyebrows} />
      <ContouringGuide data={data.contouring} />
      <GlassesCard data={data.glasses} />
      <AllInsights insights={data.insights} />
      <PhysiognomyNarrative sections={data.physiognomy_sections} llmUsed={data.llm_used} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFeatureAnchor(viz: ExtendedVisualization, featureKey: string): { x: number; y: number } {
  const kp = viz.key_points
  const avg = (pts: [number, number][]) => {
    if (pts.length === 0) return { x: 0.5, y: 0.5 }
    const sx = pts.reduce((s, p) => s + p[0], 0)
    const sy = pts.reduce((s, p) => s + p[1], 0)
    return { x: sx / pts.length, y: sy / pts.length }
  }
  switch (featureKey) {
    case 'eyes':
      return avg([kp.left_eye, kp.right_eye].filter(Boolean) as [number, number][])
    case 'eyebrows':
      return avg([kp.left_brow, kp.right_brow].filter(Boolean) as [number, number][])
    case 'nose':
      return { x: kp.nose_tip?.[0] ?? viz.center_x ?? 0.5, y: kp.nose_tip?.[1] ?? 0.48 }
    case 'mouth':
      return { x: kp.mouth_center?.[0] ?? viz.center_x ?? 0.5, y: kp.mouth_center?.[1] ?? 0.62 }
    case 'jawline':
      return { x: kp.chin?.[0] ?? viz.center_x ?? 0.5, y: (kp.chin?.[1] ?? 0.78) - 0.06 }
    case 'forehead':
      return { x: viz.forehead?.top?.[0] ?? viz.center_x ?? 0.5, y: (viz.forehead?.top?.[1] ?? 0.2) + 0.08 }
    case 'face_shape':
      return { x: viz.center_x ?? 0.5, y: 0.5 }
    case 'symmetry':
      return avg([kp.left_eye, kp.right_eye, kp.nose_tip, kp.mouth_center].filter(Boolean) as [number, number][])
    default:
      return { x: 0.5, y: 0.7 }
  }
}

function getFeaturePaidSummary(
  featureKey: string,
  report: FullReportResponse,
  t: (key: string) => string,
): { title: string; body: string } | null {
  if (!report) return null

  const byZone = (needle: string) =>
    report.contouring.zones.find((z) => z.region_id.includes(needle))?.tip

  switch (featureKey) {
    case 'eyebrows':
      return { title: t('report.eyebrows'), body: report.eyebrows.rationale }
    case 'nose':
      return { title: t('report.contouring'), body: byZone('nose') ?? report.contouring.description }
    case 'mouth':
      return { title: t('report.insights'), body: report.insights[0]?.brief ?? report.contouring.description }
    case 'jawline':
      return { title: t('report.hairstyles'), body: report.hairstyles.recommended[0]?.rationale ?? report.contouring.description }
    case 'forehead':
      return { title: t('report.hairstyles'), body: report.hairstyles.recommended[0]?.rationale ?? report.contouring.description }
    case 'eyes':
      return { title: t('report.eyebrows'), body: report.eyebrows.rationale }
    case 'face_shape':
      return { title: t('report.hairstyles'), body: report.hairstyles.recommended[0]?.rationale ?? report.glasses.recommended[0]?.rationale ?? '' }
    case 'symmetry':
      return { title: t('report.insights'), body: report.insights.find((i) => i.type === 'symmetry_detail')?.brief ?? report.insights[0]?.brief ?? '' }
    default:
      return null
  }
}
