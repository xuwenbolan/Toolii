import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ImagePlus, RefreshCw, Share2, X } from 'lucide-react'
import { useDropzone } from 'react-dropzone'

import { SEOHead } from '@/components/common/SEOHead'
import { ShareLinkDialog } from '@/components/common/ShareLinkDialog'
import { ToolActionBar } from '@/components/tools/ToolActionBar'
import { ToolErrorBanner } from '@/components/tools/ToolErrorBanner'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { ToolResultPanel } from '@/components/tools/ToolResultPanel'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useToolRunState } from '@/hooks/useToolRunState'

import { useFaceSimilarityState } from './useFaceSimilarityState'
import { OverallScoreRing } from './components/OverallScoreRing'
import { RegionBar } from './components/RegionBar'
import { NarrativeCard } from './components/NarrativeCard'
import { FunFactCards } from './components/FunFactCards'
import { ComparisonHistory } from './components/ComparisonHistory'

// ---------------------------------------------------------------------------
// Single dropzone for one face image
// ---------------------------------------------------------------------------

function FaceDropzone({
  label,
  hint,
  previewUrl,
  onSelect,
  onClear,
  replaceLabel,
}: {
  label: string
  hint: string
  previewUrl: string | null
  onSelect: (files: File[]) => void
  onClear: () => void
  replaceLabel: string
}) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length > 0) onSelect(accepted)
    },
    [onSelect],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: false,
    maxFiles: 1,
  })

  if (previewUrl) {
    return (
      <div className="relative group">
        <div className="aspect-[3/4] rounded-xl overflow-hidden border border-border/50 bg-muted/20">
          <img src={previewUrl} alt={label} className="w-full h-full object-cover" />
        </div>
        <div className="absolute inset-0 rounded-xl bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
          <Button
            size="sm"
            variant="secondary"
            className="shadow-md"
            {...getRootProps()}
            onClick={(e) => {
              e.stopPropagation()
              getRootProps().onClick?.(e as never)
            }}
          >
            <input {...getInputProps()} />
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            {replaceLabel}
          </Button>
          <Button size="sm" variant="secondary" className="shadow-md" onClick={onClear}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground text-center mt-1.5">{label}</p>
      </div>
    )
  }

  return (
    <div
      {...getRootProps()}
      className={cn(
        'aspect-[3/4] rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors',
        isDragActive
          ? 'border-primary bg-primary/5'
          : 'border-border/60 hover:border-primary/50 hover:bg-muted/30',
      )}
    >
      <input {...getInputProps()} />
      <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center">
        <ImagePlus className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="text-center px-4">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Results section
// ---------------------------------------------------------------------------

function SimilarityResults({
  result,
  previewUrl1,
  previewUrl2,
  t,
}: {
  result: NonNullable<ReturnType<typeof useFaceSimilarityState>['result']>
  previewUrl1: string | null
  previewUrl2: string | null
  t: (key: string) => string
}) {
  const regionLabels: Record<string, string> = {
    eyes: t('faceSimilarity:result.eyes'),
    nose: t('faceSimilarity:result.nose'),
    mouth: t('faceSimilarity:result.mouth'),
    jawline: t('faceSimilarity:result.jawline'),
    overall_face: t('faceSimilarity:result.overall_face'),
  }

  return (
    <div className="space-y-6 motion-safe:animate-fade-in">
      {/* Overall score */}
      <div className="flex flex-col items-center gap-3 py-4">
        <OverallScoreRing score={result.overall_score} />
        <h2 className="text-lg sm:text-xl font-bold text-center">{result.title}</h2>
        <p className="text-sm text-muted-foreground text-center max-w-md">{result.summary}</p>
      </div>

      {/* Face photos side by side */}
      {(previewUrl1 || previewUrl2) && (
        <div className="flex items-center justify-center gap-3 sm:gap-5">
          {previewUrl1 && (
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-2 border-border/50 shadow-sm">
              <img src={previewUrl1} alt="Face 1" className="w-full h-full object-cover" />
            </div>
          )}
          <span className="text-lg font-bold text-muted-foreground/60">{t('faceSimilarity:result.vs')}</span>
          {previewUrl2 && (
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-2 border-border/50 shadow-sm">
              <img src={previewUrl2} alt="Face 2" className="w-full h-full object-cover" />
            </div>
          )}
        </div>
      )}

      {/* Narrative */}
      {result.narrative && <NarrativeCard narrative={result.narrative} />}

      {/* Region comparison bars */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {t('faceSimilarity:result.regions')}
        </h3>
        <div className="space-y-4">
          {result.regions.map((r, i) => (
            <RegionBar
              key={r.region}
              region={r.region}
              label={regionLabels[r.region] ?? r.region}
              score={r.score}
              description={r.description}
              badge={r.badge}
              delay={i * 100}
            />
          ))}
        </div>
      </div>

      {/* Fun facts */}
      {result.fun_facts && result.fun_facts.length > 0 && (
        <FunFactCards facts={result.fun_facts} />
      )}

      {/* Disclaimer */}
      <p className="text-xs text-muted-foreground/70 text-center pt-2">
        {result.disclaimer}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function FaceSimilarityPage() {
  const { t } = useTranslation(['faceSimilarity', 'common'])
  const state = useFaceSimilarityState()
  const [resultPanelOpen, setResultPanelOpen] = useState(false)

  const runState = useToolRunState({
    mode: 'manual',
    hasInput: state.hasBothFiles,
    hasResult: state.hasResult,
    pending: state.pending,
    error: state.error,
  })

  // Auto-open result panel when comparison completes
  useEffect(() => {
    if (state.hasResult) setResultPanelOpen(true)
  }, [state.hasResult])

  return (
    <>
      <SEOHead
        title={t('faceSimilarity:seo.title')}
        description={t('faceSimilarity:seo.description')}
      />

      <ToolPageShell
        title={t('faceSimilarity:title')}
        description={t('faceSimilarity:subtitle')}
        toolName="facemap/similarity"
      >
        <div className="space-y-5">
          <ToolErrorBanner
            error={state.error}
            errorMeta={state.errorMeta}
            onRetry={state.retry}
          />

          {/* Dual face dropzones */}
          <div className="grid grid-cols-2 gap-3 sm:gap-5">
            <FaceDropzone
              label={t('faceSimilarity:upload.face1Title')}
              hint={t('faceSimilarity:upload.face1Hint')}
              previewUrl={state.previewUrl1}
              onSelect={state.handleFile1Select}
              onClear={() => state.handleFile1Select([])}
              replaceLabel={t('faceSimilarity:upload.replace')}
            />
            <FaceDropzone
              label={t('faceSimilarity:upload.face2Title')}
              hint={t('faceSimilarity:upload.face2Hint')}
              previewUrl={state.previewUrl2}
              onSelect={state.handleFile2Select}
              onClear={() => state.handleFile2Select([])}
              replaceLabel={t('faceSimilarity:upload.replace')}
            />
          </div>

          <p className="text-xs text-muted-foreground/60 text-center">
            {t('faceSimilarity:disclaimer')}
          </p>

          {/* Comparison history */}
          <ComparisonHistory
            entries={state.historyEntries}
            onClear={state.clearHistory}
          />
        </div>
      </ToolPageShell>

      <ToolActionBar
        mode="manual"
        status={runState.statusText}
        pending={state.pending}
        progress={state.progress}
        error={state.error}
        done={runState.phase === 'done'}
        toolName="facemap/similarity"
        ctaLabel={t('faceSimilarity:upload.button')}
        ctaDisabled={!state.hasBothFiles}
        onCta={() => void state.handleCompare()}
        onViewResult={state.hasResult ? () => setResultPanelOpen(true) : undefined}
      />

      <ToolResultPanel
        open={Boolean(state.result && resultPanelOpen)}
        title={t('faceSimilarity:result.overallScore')}
        onClose={() => setResultPanelOpen(false)}
      >
        {state.result ? (
          <div className="space-y-5">
            <SimilarityResults
              result={state.result}
              previewUrl1={state.previewUrl1}
              previewUrl2={state.previewUrl2}
              t={t}
            />
            <div className="flex justify-center gap-3">
              <Button
                variant="outline"
                onClick={() => void state.handleShare()}
                disabled={state.sharePending || state.pending}
              >
                <Share2 className="h-4 w-4 mr-2" />
                {state.sharePending
                  ? t('faceSimilarity:share.creating')
                  : t('faceSimilarity:share.button')}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setResultPanelOpen(false)
                  state.handleReset()
                }}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                {t('faceSimilarity:upload.recompare')}
              </Button>
            </div>
          </div>
        ) : null}
      </ToolResultPanel>

      <ShareLinkDialog
        open={state.shareDialogOpen}
        onOpenChange={state.setShareDialogOpen}
        shareUrl={state.shareUrl}
        title={t('faceSimilarity:share.dialogTitle')}
        expiryNotice={t('faceSimilarity:share.expiryNotice')}
        copyLabel={t('faceSimilarity:share.copyLink')}
        copiedLabel={t('faceSimilarity:share.copied')}
      />
    </>
  )
}
