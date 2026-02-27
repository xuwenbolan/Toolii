import { useCallback, useState } from 'react'

type Options = {
  errorMessage?: string
}

export function useFileUpload() {
  const [pending, setPending] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

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
      setError(options.errorMessage ?? '处理失败，请稍后再试。')
      throw err
    } finally {
      setPending(false)
    }
  }, [])

  return { pending, progress, error, setError, reset, run }
}

