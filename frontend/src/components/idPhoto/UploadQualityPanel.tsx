import { AlertTriangle, Camera, CheckCircle2, CircleDashed, ImageIcon, Lightbulb, UserRound, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

type ImageMeta = {
  width: number
  height: number
}

type QualityState = 'pass' | 'warn' | 'fail' | 'pending'

type SignalItem = {
  id: string
  label: string
  hint: string
  state: QualityState
  detail?: string
}

type Props = {
  file: File | null
  imageMeta: ImageMeta | null
  facesDetected: number | null
  warnings: string[]
}

const MIN_SIZE_BYTES = 100 * 1024
const IDEAL_MAX_SIZE_BYTES = 10 * 1024 * 1024
const HARD_MAX_SIZE_BYTES = 20 * 1024 * 1024
const MIN_SHORT_EDGE = 600

function getBand(score: number): 'excellent' | 'good' | 'risky' {
  if (score >= 90) return 'excellent'
  if (score >= 75) return 'good'
  return 'risky'
}

function getExtension(name: string) {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return ''
  return name.slice(dot + 1).toUpperCase()
}

function scoreFromSignals(signals: SignalItem[]) {
  const pointsByState: Record<Exclude<QualityState, 'pending'>, number> = {
    pass: 100,
    warn: 65,
    fail: 25,
  }
  const considered = signals.filter((item) => item.state !== 'pending')
  if (considered.length === 0) return null
  const total = considered.reduce((sum, item) => sum + pointsByState[item.state as Exclude<QualityState, 'pending'>], 0)
  return Math.round(total / considered.length)
}

function SignalStateIcon({ state }: { state: QualityState }) {
  if (state === 'pass') return <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" aria-hidden />
  if (state === 'warn') return <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-300" aria-hidden />
  if (state === 'fail') return <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-300" aria-hidden />
  return <CircleDashed className="h-4 w-4 text-slate-500 dark:text-slate-400" aria-hidden />
}

export function UploadQualityPanel({
  file,
  imageMeta,
  facesDetected,
  warnings,
}: Props) {
  const { t } = useTranslation('idPhoto')
  const isAnalyzed = facesDetected != null
  const shortEdge = imageMeta ? Math.min(imageMeta.width, imageMeta.height) : null
  const extension = file ? getExtension(file.name) : ''
  const formatState: QualityState = !file
    ? 'pending'
    : file.type === 'image/jpeg' || file.type === 'image/png'
      ? 'pass'
      : file.type.startsWith('image/')
        ? 'warn'
        : 'fail'
  const sizeState: QualityState = !file
    ? 'pending'
    : file.size < MIN_SIZE_BYTES
      ? 'warn'
      : file.size <= IDEAL_MAX_SIZE_BYTES
        ? 'pass'
        : file.size <= HARD_MAX_SIZE_BYTES
          ? 'warn'
          : 'fail'
  const resolutionState: QualityState = !file || shortEdge == null ? 'pending' : shortEdge >= MIN_SHORT_EDGE ? 'pass' : 'fail'
  const faceState: QualityState = !isAnalyzed ? 'pending' : facesDetected === 1 ? 'pass' : 'fail'
  const warningState: QualityState = !isAnalyzed ? 'pending' : warnings.length === 0 ? 'pass' : 'warn'

  const signals: SignalItem[] = [
    {
      id: 'file',
      label: t('uploadQuality.signals.file'),
      hint: t('uploadQuality.hints.file'),
      state: file ? 'pass' : 'pending',
      detail: file ? file.name : undefined,
    },
    {
      id: 'format',
      label: t('uploadQuality.signals.format'),
      hint: t('uploadQuality.hints.format'),
      state: formatState,
      detail: file ? (extension ? `${extension} (${file.type || 'unknown'})` : file.type || 'unknown') : undefined,
    },
    {
      id: 'filesize',
      label: t('uploadQuality.signals.filesize'),
      hint: t('uploadQuality.hints.filesize'),
      state: sizeState,
      detail: file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : undefined,
    },
    {
      id: 'resolution',
      label: t('uploadQuality.signals.resolution'),
      hint: t('uploadQuality.hints.resolution'),
      state: resolutionState,
      detail: imageMeta ? `${imageMeta.width}x${imageMeta.height}px` : undefined,
    },
    {
      id: 'face',
      label: t('uploadQuality.signals.face'),
      hint: t('uploadQuality.hints.face'),
      state: faceState,
      detail: isAnalyzed ? String(facesDetected ?? 0) : undefined,
    },
    {
      id: 'warnings',
      label: t('uploadQuality.signals.warnings'),
      hint: t('uploadQuality.hints.warnings'),
      state: warningState,
      detail: isAnalyzed ? t('uploadQuality.warningCount', { count: warnings.length }) : undefined,
    },
  ]

  const score = scoreFromSignals(signals)
  const band = score == null ? 'risky' : getBand(score)
  const bandColorMap: Record<'excellent' | 'good' | 'risky', string> = {
    excellent: 'text-emerald-700 dark:text-emerald-300',
    good: 'text-teal-700 dark:text-teal-300',
    risky: 'text-amber-700 dark:text-amber-300',
  }
  const barColorMap: Record<'excellent' | 'good' | 'risky', string> = {
    excellent: 'bg-emerald-500',
    good: 'bg-teal-500',
    risky: 'bg-amber-500',
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/80 p-4 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:to-slate-900/30">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">{t('uploadQuality.title')}</h3>
          <p className="text-xs text-muted-foreground">{t('uploadQuality.subtitle')}</p>
        </div>
        <div className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-medium dark:border-slate-700 dark:bg-slate-900/70">
          <span className="text-muted-foreground">{t('uploadQuality.score', { score: score ?? 0 })}</span>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-slate-200/80 bg-white/70 p-3 dark:border-slate-800 dark:bg-slate-900/70">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {score == null ? t('uploadQuality.analysisPending') : t(`uploadQuality.scoreBand.${band}`)}
          </span>
          <span className={cn('font-semibold', bandColorMap[band])}>{score ?? '--'}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-800">
          <div
            className={cn('h-full rounded-full transition-all duration-500', barColorMap[band])}
            style={{ width: `${score ?? 0}%` }}
          />
        </div>
      </div>

      <div className="grid gap-2">
        {signals.map((item) => (
          <div
            key={item.id}
            className={cn(
              'rounded-lg border px-3 py-2',
              item.state === 'pass' && 'border-emerald-200/80 bg-emerald-50/40 dark:border-emerald-900/50 dark:bg-emerald-950/20',
              item.state === 'warn' && 'border-amber-200/80 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/20',
              item.state === 'fail' && 'border-rose-200/80 bg-rose-50/40 dark:border-rose-900/50 dark:bg-rose-950/20',
              item.state === 'pending' && 'border-slate-200/80 bg-white/70 dark:border-slate-800 dark:bg-slate-900/60',
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-0.5">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <SignalStateIcon state={item.state} />
                  {item.label}
                </p>
                <p className="text-xs text-muted-foreground">{item.hint}</p>
              </div>
              <div className="space-y-1 text-right">
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                    item.state === 'pass' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200',
                    item.state === 'warn' && 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200',
                    item.state === 'fail' && 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200',
                    item.state === 'pending' && 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
                  )}
                >
                  {t(`uploadQuality.states.${item.state}`)}
                </span>
                {item.detail ? <p className="text-[11px] text-muted-foreground">{item.detail}</p> : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      {warnings.length > 0 ? (
        <div className="space-y-1.5 rounded-lg border border-amber-200/80 bg-amber-50/70 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
          {warnings.map((message, idx) => (
            <p key={`${message}-${idx}`} className="text-xs text-amber-800 dark:text-amber-100">
              {message}
            </p>
          ))}
        </div>
      ) : null}

      <div className="rounded-lg border border-dashed border-slate-300/80 bg-slate-100/60 p-3 dark:border-slate-700 dark:bg-slate-900/50">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t('uploadQuality.tipsTitle')}</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <div className="rounded-md border border-slate-200/80 bg-white/70 p-2 dark:border-slate-700 dark:bg-slate-900/60">
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <UserRound className="h-3.5 w-3.5 text-teal-600 dark:text-teal-300" aria-hidden />
              {t('uploadQuality.tips.front')}
            </p>
          </div>
          <div className="rounded-md border border-slate-200/80 bg-white/70 p-2 dark:border-slate-700 dark:bg-slate-900/60">
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <Lightbulb className="h-3.5 w-3.5 text-amber-600 dark:text-amber-300" aria-hidden />
              {t('uploadQuality.tips.light')}
            </p>
          </div>
          <div className="rounded-md border border-slate-200/80 bg-white/70 p-2 dark:border-slate-700 dark:bg-slate-900/60">
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <Camera className="h-3.5 w-3.5 text-rose-600 dark:text-rose-300" aria-hidden />
              {t('uploadQuality.tips.shoulder')}
            </p>
          </div>
        </div>
      </div>

      <div className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex">
        <ImageIcon className="h-3.5 w-3.5" aria-hidden />
        <span>{t('uploadQuality.hints.resolution')}</span>
      </div>
    </div>
  )
}
