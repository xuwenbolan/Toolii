import { AlertTriangle, BadgeCheck, ShieldAlert, ShieldCheck, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import type { ComplianceResult } from '@/services/idPhotoApi'

type Props = {
  result: ComplianceResult
}

type SeverityLevel = 'critical' | 'warning' | 'info'

function normalizeSeverity(severity: string): SeverityLevel {
  const normalized = severity.trim().toLowerCase()
  if (['critical', 'high', 'error', 'hard'].includes(normalized)) return 'critical'
  if (['warning', 'warn', 'medium', 'attention'].includes(normalized)) return 'warning'
  return 'info'
}

function getScoreBand(score: number): 'excellent' | 'good' | 'fair' | 'risky' {
  if (score >= 92) return 'excellent'
  if (score >= 80) return 'good'
  if (score >= 65) return 'fair'
  return 'risky'
}

function SummaryMetric({
  label,
  value,
  toneClassName,
}: {
  label: string
  value: number
  toneClassName: string
}) {
  return (
    <div className="rounded-lg border border-slate-200/80 bg-white/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/70">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-lg font-semibold tabular-nums', toneClassName)}>{value}</p>
    </div>
  )
}

function checkLabel(t: (key: string) => string, id: string, fallback: string): string {
  const key = `compliance.checks.${id}.label`
  const val = t(key)
  return val === key ? fallback : val
}

function checkMessage(t: (key: string) => string, id: string, passed: boolean, fallback: string): string {
  const key = `compliance.checks.${id}.${passed ? 'pass' : 'fail'}`
  const val = t(key)
  return val === key ? fallback : val
}

export function ComplianceResults({ result }: Props) {
  const { t } = useTranslation('idPhoto')
  const score = Math.max(0, Math.min(100, Math.round(result.score)))
  const scoreBand = getScoreBand(score)
  const checks = result.checks ?? []
  const severityRank: Record<SeverityLevel, number> = {
    critical: 2,
    warning: 1,
    info: 0,
  }
  const sortedChecks = [...checks].sort((a, b) => {
    if (a.passed !== b.passed) return a.passed ? 1 : -1
    return severityRank[normalizeSeverity(b.severity)] - severityRank[normalizeSeverity(a.severity)]
  })
  const failedChecks = sortedChecks.filter((check) => !check.passed)
  const passedCount = checks.length - failedChecks.length
  const attentionCount = failedChecks.length
  const criticalCount = failedChecks.filter((check) => normalizeSeverity(check.severity) === 'critical').length
  const scoreClassMap: Record<'excellent' | 'good' | 'fair' | 'risky', string> = {
    excellent: 'bg-success',
    good: 'bg-info',
    fair: 'bg-warning',
    risky: 'bg-destructive',
  }
  const scoreTextMap: Record<'excellent' | 'good' | 'fair' | 'risky', string> = {
    excellent: 'text-success',
    good: 'text-info',
    fair: 'text-warning',
    risky: 'text-destructive',
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/70 p-4 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:to-slate-900/40">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">{t('compliance.title')}</h3>
          <p className="text-xs text-muted-foreground">{t('compliance.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium',
              result.passed ? 'bg-success-light text-success' : 'bg-warning-light text-warning',
            )}
          >
            {result.passed ? <ShieldCheck className="h-3 w-3" aria-hidden /> : <ShieldAlert className="h-3 w-3" aria-hidden />}
            {result.passed ? t('compliance.pass') : t('compliance.needReview')}
          </span>
          <span className="text-muted-foreground">{t('compliance.score', { score })}</span>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border border-slate-200/80 bg-white/70 p-3 dark:border-slate-800 dark:bg-slate-900/70">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-muted-foreground">{t('compliance.scoreTitle')}</span>
          <span className={cn('font-semibold', scoreTextMap[scoreBand])}>{t(`compliance.scoreBand.${scoreBand}`)}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-800/80">
          <div
            className={cn('h-full rounded-full transition-all duration-500', scoreClassMap[scoreBand])}
            style={{ width: `${score}%` }}
          />
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <SummaryMetric label={t('compliance.metrics.passed')} value={passedCount} toneClassName="text-success" />
          <SummaryMetric label={t('compliance.metrics.attention')} value={attentionCount} toneClassName="text-warning" />
          <SummaryMetric label={t('compliance.metrics.critical')} value={criticalCount} toneClassName="text-destructive" />
        </div>
      </div>

      <div className="space-y-2">
        {sortedChecks.length === 0 ? (
          <div className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
            {t('compliance.noChecks')}
          </div>
        ) : null}
        {sortedChecks.map((check) => {
          const severity = normalizeSeverity(check.severity)
          const isCritical = severity === 'critical'
          const isWarning = severity === 'warning'
          return (
            <div
              key={check.id}
              className={cn(
                'rounded-lg border px-3 py-2',
                check.passed && 'border-success/20 bg-success-light',
                !check.passed && isCritical && 'border-destructive/20 bg-destructive-light',
                !check.passed && isWarning && 'border-warning/20 bg-warning-light',
                !check.passed && !isWarning && !isCritical && 'border-slate-200/80 bg-white/70 dark:border-slate-800 dark:bg-slate-900/60',
              )}
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {check.passed ? (
                    <BadgeCheck className="h-4 w-4 text-success" aria-hidden />
                  ) : isCritical ? (
                    <ShieldAlert className="h-4 w-4 text-destructive" aria-hidden />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
                  )}
                  {checkLabel(t, check.id, check.label)}
                </p>
                <div className="flex items-center gap-1.5">
                  {!check.passed ? (
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                        isCritical && 'bg-destructive-light text-destructive',
                        isWarning && 'bg-warning-light text-warning',
                        !isWarning && !isCritical && 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
                      )}
                    >
                      {t(`compliance.severity.${severity}`)}
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                      check.passed
                        ? 'bg-success-light text-success'
                        : 'bg-destructive-light text-destructive',
                    )}
                  >
                    {check.passed ? t('compliance.status.pass') : t('compliance.status.check')}
                  </span>
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{checkMessage(t, check.id, check.passed, check.message)}</p>
            </div>
          )
        })}
      </div>

      <div className="rounded-lg border border-dashed border-slate-300/90 bg-slate-100/60 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {t('compliance.advice.title')}
        </p>
        {failedChecks.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">{t('compliance.advice.ok')}</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-muted-foreground">{t('compliance.advice.fixIntro')}</p>
            <div className="mt-1.5 space-y-1">
              {failedChecks.slice(0, 2).map((check) => (
                <p key={`advice-${check.id}`} className="text-xs text-slate-700 dark:text-slate-200">
                  - {checkLabel(t, check.id, check.label)}
                </p>
              ))}
            </div>
            {failedChecks.length > 2 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t('compliance.advice.moreIssues', { count: failedChecks.length - 2 })}
              </p>
            ) : null}
          </>
        )}
      </div>
      <div className="hidden items-center gap-2 text-[11px] text-muted-foreground sm:flex">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
        <span>{t('compliance.metrics.total', { count: checks.length })}</span>
      </div>
    </div>
  )
}
