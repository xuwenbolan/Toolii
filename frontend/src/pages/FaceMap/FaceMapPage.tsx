import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Lock } from 'lucide-react'
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
import { useShareCard } from '@/hooks/useShareCard'
import type { ExtendedVisualization, FaceProfileResponse, FullReportResponse } from '@/services/faceMapApi'

import { useFaceMapState } from './useFaceMapState'
import { AnnotationControls, type AnnotationLayers } from './components/AnnotationControls'
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
  const { t } = useTranslation(['faceMap', 'common'])
  const { isAuthenticated } = useAuth()
  const { pending: sharePending, generate, shareOrDownload } = useShareCard()

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

  // For InsufficientCreditsDialog
  const credits = useCredits({
    enabled: isAuthenticated,
    includeTransactions: isAuthenticated,
    transactionsLimit: 5,
  })

  // Active profile data (from report or standalone profile)
  const profileData = reportResult?.profile ?? profileResult
  const hasPaidReport = Boolean(reportResult)
  const actionPending = pending || reportPending || sharePending
  const actionError = error ?? reportError ?? null
  const actionStatus = reportPending
    ? t('faceMap:report.generating')
    : sharePending
      ? t('faceMap:share.generating')
      : actionError ?? runState.statusText
  const actionProgress = pending ? progress : null

  const handleShare = async () => {
    if (!profileData || !hasPaidReport || !inputPreviewUrl) return
    try {
      const blob = await generate({
        title: t('faceMap:title'),
        subtitle: t('faceMap:subtitle'),
        overallScore: profileData.overall_score,
        geneDescription: profileData.gene_card.description,
        tags: profileData.tags,
        dimensions: profileData.dimensions.map((d) => ({
          label: d.label,
          percentile: d.percentile,
        })),
        imageUrl: inputPreviewUrl,
        scoreLabel: t('faceMap:share.scoreLabel'),
        insightLabel: t('faceMap:share.insightLabel'),
        watermark: t('faceMap:share.watermark'),
      })
      await shareOrDownload(blob, `facemap-${Date.now()}.png`)
      toast.success(t('faceMap:share.saved'))
    } catch {
      toast.error(t('faceMap:share.failed'))
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
      <ToolPageShell
        title={t('faceMap:title')}
        description={t('faceMap:subtitle')}
        backTo="/"
        layout={hasResult ? 'split' : 'compact'}
        width="wide"
        sidebar={hasResult && profileData ? (
          <ResultsSidebar
            profileData={profileData}
            reportResult={reportResult}
            reportPending={reportPending}
            reportError={reportError}
            isAuthenticated={isAuthenticated}
            highlightedFeature={highlightedFeature}
            onFeatureClick={setHighlightedFeature}
            onUnlockReport={handleReportAnalyze}
          />
        ) : undefined}
      >
        {/* Upload phase */}
        {!hasResult && (
          <ToolWorkspaceDropzone
            accept={{ 'image/*': [] }}
            multiple={false}
            maxFiles={1}
            onFiles={handleFileSelect}
            title={t('faceMap:upload.title')}
            hint={t('faceMap:upload.hint')}
          />
        )}

        <ToolErrorBanner error={error} errorMeta={errorMeta} onRetry={file ? () => retry() : undefined} />

        {/* Image with face annotation overlay */}
        {hasResult && file && inputPreviewUrl && (
          <AnnotatedImage
            src={inputPreviewUrl}
            alt={file.name}
            visualization={visualization ?? undefined}
            highlightedFeature={highlightedFeature}
            onFeatureClick={setHighlightedFeature}
            features={profileData?.features}
            reportResult={reportResult}
            showLockedPaidOverlay={Boolean(profileData) && !hasPaidReport && isAuthenticated}
          />
        )}
      </ToolPageShell>

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
            ? hasPaidReport
              ? (sharePending ? t('faceMap:share.generating') : t('faceMap:share.button'))
              : isAuthenticated
                ? t('faceMap:report.unlock')
                : undefined
            : undefined
        }
        secondaryCtaDisabled={actionPending}
        onSecondaryCta={
          hasResult
            ? hasPaidReport
              ? () => void handleShare()
              : isAuthenticated
                ? () => void handleReportAnalyze()
                : undefined
            : undefined
        }
        maxWidthClassName="max-w-6xl"
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
// Annotated image with face overlay (collapsible on mobile)
// ---------------------------------------------------------------------------

function AnnotatedImage({
  src,
  alt,
  visualization,
  highlightedFeature,
  onFeatureClick,
  features,
  reportResult,
  showLockedPaidOverlay,
}: {
  src: string
  alt: string
  visualization?: ExtendedVisualization
  highlightedFeature?: string | null
  onFeatureClick?: (key: string | null) => void
  features?: FaceProfileResponse['features']
  reportResult?: FullReportResponse | null
  showLockedPaidOverlay?: boolean
}) {
  const { t } = useTranslation('faceMap')
  const imgRef = useRef<HTMLImageElement>(null)
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null)
  // Default collapsed on mobile (< lg breakpoint) so results are visible first
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 1024)
  const [layers, setLayers] = useState<AnnotationLayers>({
    contour: true,
    threeCourts: true,
    fiveEyes: true,
    keyPoints: true,
  })
  const effectiveCollapsed = collapsed && !highlightedFeature

  const handleToggle = (layer: keyof AnnotationLayers) => {
    setLayers((prev) => ({ ...prev, [layer]: !prev[layer] }))
  }

  const handleFeatureSelect = (key: string | null) => {
    if (key == null) {
      onFeatureClick?.(null)
      return
    }
    onFeatureClick?.(highlightedFeature === key ? null : key)
  }

  const popAnchor = useMemo(() => {
    if (!visualization || !highlightedFeature) return undefined
    return getFeatureAnchor(visualization, highlightedFeature)
  }, [visualization, highlightedFeature])

  const paidSummary = useMemo(() => {
    if (!highlightedFeature || !reportResult) return null
    return getFeaturePaidSummary(highlightedFeature, reportResult, t)
  }, [highlightedFeature, reportResult, t])

  return (
    <div className="space-y-2">
      {/* Collapse toggle (mobile only) */}
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-lg bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground lg:hidden"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span>{effectiveCollapsed ? t('image.expand') : t('image.collapse')}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', effectiveCollapsed && '-rotate-90')} />
      </button>

      {!effectiveCollapsed && (
        <>
          <div className="flex justify-center">
            <div className="relative overflow-hidden rounded-xl border bg-muted/30 p-1">
              <div className="relative inline-block">
                <img
                  ref={imgRef}
                  src={src}
                  alt={alt}
                  className="block max-h-[40vh] sm:max-h-[45vh] lg:max-h-[50vh] max-w-full rounded-lg"
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
                    showLockedPaidOverlay={showLockedPaidOverlay}
                  />
                )}
                {highlightedFeature && features?.[highlightedFeature] && (
                  <FeaturePopover
                    featureKey={highlightedFeature}
                    feature={features[highlightedFeature]}
                    anchor={popAnchor}
                    paidSummary={paidSummary}
                    onClose={() => onFeatureClick?.(null)}
                  />
                )}
              </div>
            </div>
          </div>
          {visualization && (
            <AnnotationControls layers={layers} onToggle={handleToggle} />
          )}
        </>
      )}
    </div>
  )
}

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
// Results sidebar (scrollable card list)
// ---------------------------------------------------------------------------

function ResultsSidebar({
  profileData,
  reportResult,
  reportPending,
  reportError,
  isAuthenticated,
  highlightedFeature,
  onFeatureClick,
  onUnlockReport,
}: {
  profileData: FaceProfileResponse
  reportResult: FullReportResponse | null
  reportPending: boolean
  reportError: string | null
  isAuthenticated: boolean
  highlightedFeature: string | null
  onFeatureClick: (key: string | null) => void
  onUnlockReport: () => void
}) {
  const { t } = useTranslation(['faceMap', 'common'])
  const location = useLocation()
  const loginRedirect = encodeURIComponent(location.pathname + location.search)

  // Auto-scroll to report section when it first appears
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

  return (
    <div className="space-y-4">
      {/* Section navigation */}
      <SectionNav sections={navSections} />

      <div className="space-y-4 tool-section-stagger">
        {/* Gene Card */}
        <div data-section-id="gene">
          <GeneCard data={profileData.gene_card} />
        </div>

        {/* Score + Radar + Tags */}
        <div data-section-id="score" className="flex flex-col items-center gap-4 rounded-xl border bg-card p-5 text-center">
          <div className="flex items-center gap-6 flex-wrap justify-center">
            <div className="flex flex-col items-center gap-1">
              <ScoreRing score={profileData.overall_score} />
              <h3 className="text-xs font-medium text-muted-foreground">{t('faceMap:profile.overallScore')}</h3>
            </div>
            {profileData.dimensions.length > 0 && (
              <AestheticsRadar dimensions={profileData.dimensions} />
            )}
          </div>

          {/* Percentile labels */}
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

          {/* Dimension basis detail */}
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
        <div data-section-id="summary" className="rounded-xl border bg-card p-4">
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
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-4 text-center">
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
  )
}

// ---------------------------------------------------------------------------
// Paid report results
// ---------------------------------------------------------------------------

function PaidReportResults({ data }: { data: FullReportResponse }) {
  return (
    <div className="space-y-4 tool-section-stagger">
      <HairstyleCard data={data.hairstyles} />
      <EyebrowComparison data={data.eyebrows} />
      <ContouringGuide data={data.contouring} />
      <GlassesCard data={data.glasses} />
      <AllInsights insights={data.insights} />
      <PhysiognomyNarrative sections={data.physiognomy_sections} llmUsed={data.llm_used} />
    </div>
  )
}
