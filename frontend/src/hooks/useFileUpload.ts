import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

type Options = {
  errorMessage?: string
}

export function useFileUpload() {
  const [pending, setPending] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { t } = useTranslation('common')

  const reset = useCallback(() => {
    setError(null)
    setProgress(null)
  }, [])

  const run = useCallback(async <T>(
    task: (onProgress: (percent: number) => void) => Promise<T>,
    options: Options = {},
  ): Promise<T> => {
    setPending(true)
    setError(null)
    setProgress(0)

    try {
      const result = await task((percent) => {
        const value = Number.isFinite(percent) ? percent : 0
        setProgress(Math.max(0, Math.min(100, Math.round(value))))
      })
      setProgress(100)
      return result
    } catch (err) {
      setError(options.errorMessage ?? t('errors.processingFailed'))
      throw err
    } finally {
      setPending(false)
    }
  }, [t])

  return { pending, progress, error, setError, reset, run }
}
