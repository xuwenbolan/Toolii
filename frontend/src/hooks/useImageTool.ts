import { useCallback, useMemo, useState } from 'react'

import { useFileUpload } from '@/hooks/useFileUpload'
import { useObjectUrl } from '@/hooks/useObjectUrl'
import { useToolRunState } from '@/hooks/useToolRunState'
import { formatBytes } from '@/lib/fileValidation'
import type { FileResult } from '@/services/imageApi'

type ApiCall<T> = (
  file: File,
  onProgress: (percent: number) => void,
) => Promise<T>

/**
 * Shared state and logic for single-file image tool pages.
 *
 * Manages: file selection, result, result-panel visibility, input preview URL,
 * and delegates upload lifecycle to useFileUpload.
 *
 * The generic parameter T defaults to FileResult but can be overridden
 * for tools that return a different shape.
 */
export function useImageTool<T = FileResult>() {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<T | null>(null)
  const [resultPanelOpen, setResultPanelOpen] = useState(false)
  const { pending, progress, error, errorMeta, reset, run, retry } = useFileUpload()
  const inputPreviewUrl = useObjectUrl(file)

  const fileInfo = useMemo(() => {
    if (!file) return undefined
    return `${file.name} · ${formatBytes(file.size)}`
  }, [file])

  // Build resultInfo only when T is FileResult-shaped
  const resultInfo = useMemo(() => {
    if (!result) return undefined
    const r = result as Record<string, unknown>
    if (typeof r.filename === 'string' && typeof r.size === 'number') {
      return `${r.filename} · ${formatBytes(r.size)}`
    }
    return undefined
  }, [result])

  const runState = useToolRunState({
    mode: 'manual',
    hasInput: Boolean(file),
    hasResult: Boolean(result),
    pending,
    error,
    texts: { input: fileInfo, result: resultInfo },
  })

  const handleFiles = useCallback((files: File[]) => {
    reset()
    setResult(null)
    setResultPanelOpen(false)
    setFile(files[0] ?? null)
  }, [reset])

  const runTool = useCallback(async (apiCall: ApiCall<T>) => {
    if (!file) return
    setResult(null)
    setResultPanelOpen(false)
    try {
      const res = await run((onProgress) => apiCall(file, onProgress))
      setResult(res)
      setResultPanelOpen(true)
    } catch {
      // Error handled by useFileUpload.
    }
  }, [file, run])

  const openResultPanel = useCallback(() => setResultPanelOpen(true), [])
  const closeResultPanel = useCallback(() => setResultPanelOpen(false), [])

  return {
    // File state
    file,
    setFile,
    handleFiles,
    inputPreviewUrl,

    // Result state
    result,
    setResult,
    resultPanelOpen,
    openResultPanel,
    closeResultPanel,

    // Upload state (delegated from useFileUpload)
    pending,
    progress,
    error,
    errorMeta,
    reset,
    retry,

    // Run
    runTool,
    runState,
  }
}
