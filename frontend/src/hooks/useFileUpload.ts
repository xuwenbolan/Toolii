import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { deriveToolErrorMeta, type ToolErrorMeta } from '@/lib/toolErrors'

type Options = {
  errorMessage?: string
}

export function useFileUpload() {
  const [pending, setPending] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorMeta, setErrorMeta] = useState<ToolErrorMeta | null>(null)
  const lastTaskRef = useRef<((onProgress: (percent: number) => void) => Promise<unknown>) | null>(null)
  const lastOptionsRef = useRef<Options | undefined>(undefined)
  const { t } = useTranslation('common')

  const setErrorState = useCallback((next: string | null) => {
    setError(next)
    if (next == null) {
      setErrorMeta(null)
      return
    }
    setErrorMeta((current) => current ?? { kind: 'processing_failed', message: next, recoverable: true })
  }, [])

  const reset = useCallback(() => {
    setErrorState(null)
    setProgress(null)
  }, [setErrorState])

  const run = useCallback(async <T>(
    task: (onProgress: (percent: number) => void) => Promise<T>,
    options: Options = {},
  ): Promise<T> => {
    lastTaskRef.current = task as (onProgress: (percent: number) => void) => Promise<unknown>
    lastOptionsRef.current = options
    setPending(true)
    setErrorState(null)
    setProgress(0)

    try {
      const result = await task((percent) => {
        const value = Number.isFinite(percent) ? percent : 0
        setProgress(Math.max(0, Math.min(100, Math.round(value))))
      })
      setProgress(100)
      return result
    } catch (err) {
      const fallbackMessage = options.errorMessage ?? t('errors.processingFailed')
      const meta = deriveToolErrorMeta(err, fallbackMessage)
      setError(meta.message)
      setErrorMeta(meta)
      throw err
    } finally {
      setPending(false)
    }
  }, [setErrorState, t])

  const retry = useCallback(async () => {
    const lastTask = lastTaskRef.current
    if (!lastTask) return null
    return run(lastTask, lastOptionsRef.current)
  }, [run])

  return { pending, progress, error, errorMeta, setError: setErrorState, reset, run, retry }
}
