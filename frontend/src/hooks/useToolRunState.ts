import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

export type ToolRunMode = 'auto' | 'manual' | 'none'
export type ToolRunPhase = 'empty' | 'ready' | 'processing' | 'done' | 'error'

type RunStateTexts = {
  empty?: string
  input?: string
  processing?: string
  result?: string
  error?: string
}

type Options = {
  mode: ToolRunMode
  hasInput: boolean
  hasResult: boolean
  pending: boolean
  error?: string | null
  texts?: RunStateTexts
}

export function useToolRunState({
  mode,
  hasInput,
  hasResult,
  pending,
  error,
  texts,
}: Options) {
  const { t } = useTranslation('common')

  const phase: ToolRunPhase = useMemo(() => {
    if (error) return 'error'
    if (pending) return 'processing'
    if (hasResult) return 'done'
    if (hasInput) return 'ready'
    return 'empty'
  }, [error, hasInput, hasResult, pending])

  const statusText = useMemo(() => {
    if (phase === 'error') return texts?.error ?? error ?? t('errors.processingFailed')
    if (phase === 'processing') return texts?.processing ?? t('actions.processingWait')
    if (phase === 'done') return texts?.result ?? texts?.input ?? t('upload.dropHere')
    if (phase === 'ready') return texts?.input ?? t('upload.dropHere')
    return texts?.empty ?? t('upload.dropHere')
  }, [error, phase, t, texts])

  return {
    phase,
    statusText,
    canRun: mode === 'manual' && hasInput && !pending && !error,
    showActionBar: mode !== 'none',
  }
}
