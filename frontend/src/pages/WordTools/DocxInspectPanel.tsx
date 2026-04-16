import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle2, ChevronRight, CircleAlert, Info, Type, Image, FileText, Hash, Layers, BookOpen, Trash2, X } from 'lucide-react'

import type { DocxAnalysisResult } from '@/services/docxApi'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

type Props = {
  analysis: DocxAnalysisResult | null
  loading: boolean
  error: string | null
  selectedIssues?: Set<string>
  onToggleIssue?: (code: string) => void
  onToggleAll?: () => void
}

export function DocxInspectPanel({ analysis, loading, error, selectedIssues, onToggleIssue, onToggleAll }: Props) {
  if (loading) {
    return (
      <div className="flex-1 flex flex-col">
        {/* Score skeleton */}
        <div className="px-4 py-4 flex items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-muted animate-pulse shrink-0" />
          <div className="space-y-2 flex-1">
            <div className="h-4 w-20 rounded bg-muted animate-pulse" />
            <div className="h-3 w-28 rounded bg-muted animate-pulse" />
          </div>
        </div>
        {/* Metadata skeleton */}
        <div className="px-4 py-3 border-t border-border">
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <div className="h-3.5 w-8 rounded bg-muted animate-pulse" />
                <div className="h-2.5 w-12 rounded bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        </div>
        {/* Heading skeleton */}
        <div className="px-4 py-3 border-t border-border space-y-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-3 rounded bg-muted animate-pulse" style={{ width: `${60 + i * 10}%`, marginLeft: `${i * 12}px` }} />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm px-4 text-center">
        {error}
      </div>
    )
  }

  if (!analysis) return null

  return (
    <div className="flex-1 overflow-y-auto docx-inspector-scroll">
      <ScoreSection score={analysis.score} issueCount={analysis.issues.length} />
      <MetadataGrid metadata={analysis.metadata} />
      <HeadingStructure headings={analysis.headings} />
      <IssueList
        issues={analysis.issues}
        selectedIssues={selectedIssues}
        onToggleIssue={onToggleIssue}
        onToggleAll={onToggleAll}
      />
    </div>
  )
}

// ── Score Ring ───────────────────────────────────────────────

function ScoreSection({ score, issueCount }: { score: number; issueCount: number }) {
  const { t } = useTranslation('tools')

  const radius = 36
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference

  const ringColor =
    score >= 80 ? 'var(--canvas-score-high)' :
    score >= 60 ? 'var(--canvas-score-mid)' :
    score >= 40 ? 'var(--canvas-score-low)' :
    'var(--canvas-score-poor)'

  const textColor =
    score >= 80 ? 'text-success' :
    score >= 60 ? 'text-warning' :
    'text-destructive'

  const glowColor =
    score >= 80 ? 'var(--canvas-score-high)' :
    score >= 60 ? 'var(--canvas-score-mid)' :
    score >= 40 ? 'var(--canvas-score-low)' :
    'var(--canvas-score-poor)'

  const label =
    score >= 90 ? t('docx.workspace.scoreExcellent') :
    score >= 70 ? t('docx.workspace.scoreGood') :
    score >= 50 ? t('docx.workspace.scoreNeedsAttention') :
    t('docx.workspace.scorePoor')

  return (
    <div className="docx-inspector-section px-4 py-4 flex items-center gap-4">
      {/* SVG ring gauge with glow */}
      <div className="relative shrink-0" style={{ width: 80, height: 80 }}>
        {/* Glow halo */}
        <div
          className="absolute inset-1 rounded-full opacity-15 blur-md"
          style={{ background: glowColor }}
        />
        <svg viewBox="0 0 80 80" className="w-full h-full relative">
          <circle
            cx="40" cy="40" r={radius}
            className="docx-score-ring-track"
          />
          <circle
            cx="40" cy="40" r={radius}
            className="docx-score-ring-value"
            style={{
              '--ring-circumference': `${circumference}`,
              '--ring-offset': `${offset}`,
              stroke: ringColor,
            } as React.CSSProperties}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('text-xl font-bold tabular-nums leading-none', textColor)}>
            {score}
          </span>
          <span className="text-[9px] text-muted-foreground mt-0.5 uppercase tracking-wider font-medium">
            / 100
          </span>
        </div>
      </div>

      {/* Score text */}
      <div className="min-w-0">
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {issueCount === 0
            ? t('docx.workspace.noIssues')
            : t('docx.workspace.issueCount', { count: issueCount })}
        </div>
      </div>
    </div>
  )
}

// ── Metadata Grid ───────────────────────────────────────────

const METADATA_ITEMS = [
  { key: 'wordCount', field: 'word_count', icon: Type, format: 'number' },
  { key: 'paragraphCount', field: 'paragraph_count', icon: FileText, format: 'number' },
  { key: 'headingCount', field: 'heading_count', icon: Hash, format: 'plain' },
  { key: 'imageCount', field: 'image_count', icon: Image, format: 'plain' },
  { key: 'pageEstimate', field: 'page_count_estimate', icon: BookOpen, format: 'plain' },
  { key: 'styleCount', field: 'style_count', icon: Layers, format: 'plain' },
] as const

function MetadataGrid({ metadata }: { metadata: DocxAnalysisResult['metadata'] }) {
  const { t } = useTranslation('tools')

  return (
    <div className="docx-inspector-section px-4 py-3">
      <div className="grid grid-cols-3 gap-1.5">
        {METADATA_ITEMS.map((item) => {
          const Icon = item.icon
          const raw = metadata[item.field as keyof typeof metadata]
          const value = item.format === 'number' && typeof raw === 'number'
            ? raw.toLocaleString()
            : String(raw)
          return (
            <div key={item.key} className="rounded-md bg-muted/40 px-2 py-1.5 min-w-0">
              <div className="flex items-center gap-1 mb-0.5">
                <Icon className="h-2.5 w-2.5 text-muted-foreground/70 shrink-0" aria-hidden="true" />
                <span className="text-[10px] text-muted-foreground leading-tight truncate">
                  {t(`docx.metadata.${item.key}`)}
                </span>
              </div>
              <div className="text-xs font-semibold tabular-nums leading-tight truncate">{value}</div>
            </div>
          )
        })}
      </div>
      {metadata.font_families.length > 0 && (
        <div className="mt-2.5 text-[11px] text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground/80">{t('docx.metadata.fontFamilies')}:</span>{' '}
          <span className="font-mono text-[10px]">{metadata.font_families.join(', ')}</span>
        </div>
      )}
    </div>
  )
}

// ── Heading Structure Tree ──────────────────────────────────

const LEVEL_BADGE_COLORS = [
  '', // H0 unused
  'bg-primary/10 text-primary',
  'bg-muted text-muted-foreground',
  'bg-muted text-muted-foreground',
  'bg-muted text-muted-foreground',
  'bg-muted text-muted-foreground',
  'bg-muted text-muted-foreground',
]

function HeadingStructure({ headings }: { headings: DocxAnalysisResult['headings'] }) {
  const { t } = useTranslation('tools')
  const [collapsed, setCollapsed] = useState(false)

  if (headings.length === 0) return null

  // Find the minimum level to normalize indentation
  const minLevel = Math.min(...headings.map((h) => h.level))

  return (
    <div className="docx-inspector-section">
      <button
        className="flex items-center justify-between w-full px-4 py-2.5 text-xs font-medium text-muted-foreground hover:bg-accent/50 transition-colors duration-150"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
      >
        <div className="flex items-center gap-1.5">
          <span>{t('docx.structure.title')}</span>
          <span className="text-[10px] tabular-nums opacity-60">({headings.length})</span>
        </div>
        <ChevronRight className={cn('h-3 w-3 transition-transform duration-200', !collapsed && 'rotate-90')} />
      </button>
      {!collapsed && (
        <div className="px-4 pb-3 docx-heading-tree">
          {headings.map((h, i) => {
            const depth = h.level - minLevel
            const badgeColor = LEVEL_BADGE_COLORS[h.level] ?? LEVEL_BADGE_COLORS[6]
            return (
              <div
                key={i}
                className="docx-heading-tree-node"
                style={{ marginLeft: `${depth * 14}px` }}
              >
                <div
                  className={cn(
                    'flex items-center gap-1.5 py-0.5 text-xs leading-relaxed',
                    h.has_issue && 'text-warning',
                  )}
                >
                  <span className={cn(
                    'inline-flex items-center justify-center h-3.5 min-w-[1.25rem] rounded text-[8px] font-bold shrink-0 uppercase',
                    badgeColor,
                  )}>
                    H{h.level}
                  </span>
                  {h.has_issue && <AlertTriangle className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />}
                  <span className="truncate">
                    {h.text || <em className="text-muted-foreground not-italic">{t('docx.structure.emptyHeading')}</em>}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Issue List ──────────────────────────────────────────────

type IssueListProps = {
  issues: DocxAnalysisResult['issues']
  selectedIssues?: Set<string>
  onToggleIssue?: (code: string) => void
  onToggleAll?: () => void
}

function IssueList({ issues, selectedIssues, onToggleIssue, onToggleAll }: IssueListProps) {
  const { t } = useTranslation('tools')
  const selectable = Boolean(selectedIssues && onToggleIssue)

  if (issues.length === 0) {
    return (
      <div className="docx-inspector-section px-4 py-4">
        <div className="flex items-center gap-2 rounded-md bg-success-light px-3 py-2.5">
          <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
          <span className="text-xs font-medium text-success">
            {t('docx.workspace.noIssues')}
          </span>
        </div>
      </div>
    )
  }

  const allSelected = selectable && issues.every((i) => selectedIssues!.has(i.code))

  return (
    <div className="docx-inspector-section">
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="text-xs font-medium text-muted-foreground">
          {t('docx.issues.title')} ({issues.length})
        </span>
        {selectable && onToggleAll && (
          <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5" onClick={onToggleAll}>
            {allSelected ? t('docx.workspace.deselectAllIssues') : t('docx.workspace.selectAllIssues')}
          </Button>
        )}
      </div>
      <div className="px-3 pb-3 space-y-0.5">
        {issues.map((issue) => (
          <IssueRow
            key={issue.code}
            issue={issue}
            selected={selectedIssues?.has(issue.code)}
            onToggle={onToggleIssue ? () => onToggleIssue(issue.code) : undefined}
            isCodeSelected={selectedIssues ? (code: string) => selectedIssues.has(code) : undefined}
            onToggleCode={onToggleIssue}
          />
        ))}
      </div>
    </div>
  )
}

// ── Compact Issue Row ───────────────────────────────────────

const SEVERITY_ICON = {
  critical: CircleAlert,
  warning: AlertTriangle,
  info: Info,
} as const

const SEVERITY_ACCENT = {
  critical: 'docx-issue-critical',
  warning: 'docx-issue-warning',
  info: 'docx-issue-info',
} as const

type IssueRowProps = {
  issue: DocxAnalysisResult['issues'][number]
  selected?: boolean
  onToggle?: () => void
  /** For citation issues: check if a synthetic code is selected */
  isCodeSelected?: (code: string) => boolean
  /** For citation issues: toggle a synthetic code */
  onToggleCode?: (code: string) => void
}

const IssueRow = memo(function IssueRow({ issue, selected, onToggle, isCodeSelected, onToggleCode }: IssueRowProps) {
  const { t } = useTranslation('tools')
  const [expanded, setExpanded] = useState(false)

  const issueKey = `docx.issues.${issue.code}` as const
  const title = t(issueKey, { defaultValue: '' }) || issue.message
  const accentClass = SEVERITY_ACCENT[issue.severity as keyof typeof SEVERITY_ACCENT] ?? SEVERITY_ACCENT.info
  const Icon = SEVERITY_ICON[issue.severity as keyof typeof SEVERITY_ICON] ?? Info

  // For citation issues, auto-expand to show detail
  const isCitationDetail = issue.code === 'CITATION_OUT_OF_RANGE' || issue.code === 'CITATION_GAP' || issue.code === 'CITATION_NEVER_CITED'

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded} defaultOpen={isCitationDetail}>
      <div
        className={cn(
          'group flex items-center gap-1.5 rounded-md text-xs transition-all duration-150 overflow-hidden',
          'hover:bg-accent/60',
          selected && 'bg-accent/40',
          onToggle && 'cursor-pointer',
          accentClass,
        )}
        onClick={onToggle}
      >
        {/* Severity accent bar */}
        <div className="docx-issue-accent-bar w-[2.5px] self-stretch shrink-0 rounded-l-md" />

        <div className="flex items-center gap-1.5 flex-1 min-w-0 px-1.5 py-1.5">
          {onToggle !== undefined && (
            <Checkbox
              checked={selected ?? false}
              onCheckedChange={() => onToggle()}
              onClick={(e) => e.stopPropagation()}
              className="h-3.5 w-3.5 shrink-0"
            />
          )}
          <span className="flex-1 min-w-0 truncate">{title}</span>
          {issue.fixable && (
            <Badge variant="outline" className="docx-fix-badge text-[9px] px-1 py-0 h-3.5 font-semibold shrink-0 border-success/40 text-success">
              FIX
            </Badge>
          )}
          {issue.count > 1 && (
            <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
              x{issue.count}
            </span>
          )}
          <CollapsibleTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="sm" className="h-4 w-4 p-0 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <ChevronRight className={cn('h-3 w-3 transition-transform duration-200', expanded && 'rotate-90')} />
            </Button>
          </CollapsibleTrigger>
        </div>
      </div>
      <CollapsibleContent>
        <div className="px-2 pb-2 ml-[2.5px] pl-3 border-l-[2.5px] border-transparent">
          {issue.code === 'CITATION_OUT_OF_RANGE' || issue.code === 'CITATION_GAP' ? (
            <CitationDeleteDetail
              issue={issue}
              isCodeSelected={isCodeSelected}
              onToggleCode={onToggleCode}
            />
          ) : issue.code === 'CITATION_NEVER_CITED' ? (
            <CitationNeverCitedDetail issue={issue} />
          ) : (
            <div className="flex items-start gap-1.5">
              <Icon className="h-3 w-3 mt-0.5 text-muted-foreground/70 shrink-0" aria-hidden="true" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {issue.message}
              </p>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
})

// ── Citation Detail Views ────────────────────────────────────

function CitationDeleteDetail({
  issue,
  isCodeSelected,
  onToggleCode,
}: {
  issue: DocxAnalysisResult['issues'][number]
  isCodeSelected?: (code: string) => boolean
  onToggleCode?: (code: string) => void
}) {
  const { t } = useTranslation('tools')
  const numbers: number[] = (issue.params?.numbers ?? issue.params?.missing ?? []) as number[]
  const markedCount = numbers.filter((n) => isCodeSelected?.(`CITATION_DELETE_${n}`)).length

  return (
    <div className="py-1.5 space-y-2">
      {/* Actionable banner */}
      <div className="flex items-center gap-1.5 rounded-md bg-[hsl(var(--warning-light))] px-2.5 py-2 text-[11px]">
        <AlertTriangle className="h-3.5 w-3.5 text-[hsl(var(--warning))] shrink-0" />
        <span className="text-foreground leading-relaxed">
          {issue.code === 'CITATION_OUT_OF_RANGE'
            ? t('docx.issues.citationOutOfRangeAction')
            : t('docx.issues.citationGapAction')}
        </span>
      </div>

      {/* Citation number chips */}
      <div className="flex flex-wrap gap-1.5">
        {numbers.map((num) => {
          const code = `CITATION_DELETE_${num}`
          const isMarked = isCodeSelected?.(code) ?? false
          return (
            <button
              key={num}
              onClick={(e) => { e.stopPropagation(); onToggleCode?.(code) }}
              className={cn(
                'group/chip inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-all duration-150',
                isMarked
                  ? 'bg-destructive/10 border-destructive/30 text-destructive'
                  : 'bg-card border-border hover:border-foreground/30 text-foreground',
              )}
            >
              <span className={cn('tabular-nums', isMarked && 'line-through decoration-2')}>
                [{num}]
              </span>
              {isMarked ? (
                <X className="h-3 w-3 text-destructive" />
              ) : (
                <Trash2 className="h-3 w-3 text-muted-foreground group-hover/chip:text-destructive transition-colors" />
              )}
            </button>
          )
        })}
      </div>

      {/* Status hint */}
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        {markedCount > 0
          ? t('docx.issues.citationDeleteMarked', { count: markedCount })
          : t('docx.issues.citationDeleteHint')}
      </p>
    </div>
  )
}

function CitationNeverCitedDetail({
  issue,
}: {
  issue: DocxAnalysisResult['issues'][number]
}) {
  const { t } = useTranslation('tools')
  const numbers = (issue.params?.numbers ?? []) as number[]
  const entries = (issue.params?.entries ?? {}) as Record<string, string>

  return (
    <div className="py-1.5 space-y-2">
      {/* Info banner */}
      <div className="flex items-start gap-1.5 rounded-md bg-[hsl(var(--info-light))] px-2.5 py-2 text-[11px]">
        <Info className="h-3.5 w-3.5 text-[hsl(var(--info))] shrink-0 mt-0.5" />
        <span className="text-foreground leading-relaxed">
          {t('docx.issues.citationNeverCitedHint')}
        </span>
      </div>

      {/* Reference entry cards */}
      <div className="space-y-1">
        {numbers.map((num) => {
          const text = entries[String(num)] ?? ''
          return (
            <div
              key={num}
              className="flex items-start gap-2 rounded-md border border-border/60 bg-card px-2.5 py-2 text-[11px]"
            >
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-mono tabular-nums shrink-0 mt-0.5">
                {num}
              </Badge>
              <span className="text-muted-foreground leading-relaxed line-clamp-2">{text}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
