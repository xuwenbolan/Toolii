import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useFileUpload } from '@/hooks/useFileUpload'
import { useObjectUrl } from '@/hooks/useObjectUrl'
import { useToolRunState } from '@/hooks/useToolRunState'
import { precompressImage } from '@/lib/imageCompressor'
import { deriveToolErrorMeta } from '@/lib/toolErrors'
import {
  analyzeFaceProfile,
  analyzeFaceReport,
  type FaceProfileResponse,
  type FullReportResponse,
} from '@/services/faceMapApi'

export function useFaceMapState() {
  const { t } = useTranslation('faceMap')

  const [file, setFile] = useState<File | null>(null)
  const [profileResult, setProfileResult] = useState<FaceProfileResponse | null>(null)
  const [reportResult, setReportResult] = useState<FullReportResponse | null>(null)
  const [reportPending, setReportPending] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)
  const [insufficientDialogOpen, setInsufficientDialogOpen] = useState(false)
  const [highlightedFeature, setHighlightedFeature] = useState<string | null>(null)

  const { pending, progress, error, errorMeta, reset, run, retry } = useFileUpload()
  const inputPreviewUrl = useObjectUrl(file)

  const hasResult = Boolean(profileResult) || Boolean(reportResult)

  const runState = useToolRunState({
    mode: 'manual',
    hasInput: Boolean(file),
    hasResult,
    pending,
    error,
    texts: {
      input: file ? file.name : undefined,
    },
  })

  const visualization = useMemo(() => {
    if (reportResult) return reportResult.profile.visualization
    if (profileResult) return profileResult.visualization
    return undefined
  }, [reportResult, profileResult])

  const handleFileSelect = useCallback(
    (files: File[]) => {
      reset()
      setProfileResult(null)
      setReportResult(null)
      setReportError(null)
      setHighlightedFeature(null)
      setFile(files[0] ?? null)
    },
    [reset],
  )

  const handleAnalyze = useCallback(async () => {
    if (!file) return
    setProfileResult(null)
    setReportResult(null)
    setReportError(null)

    try {
      const compressed = await precompressImage(file, { maxSizeMB: 2, maxWidthOrHeight: 2048 })
      const res = await run((onProgress) => analyzeFaceProfile(compressed, onProgress))
      setProfileResult(res)
    } catch {
      // handled by useFileUpload
    }
  }, [file, run])

  const handleReportAnalyze = useCallback(async () => {
    if (!file) return
    setReportError(null)
    setReportPending(true)

    try {
      const compressed = await precompressImage(file, { maxSizeMB: 2, maxWidthOrHeight: 2048 })
      const res = await analyzeFaceReport(compressed)
      setReportResult(res)
    } catch (err: unknown) {
      const meta = deriveToolErrorMeta(err, t('errors.reportFailed'))
      // Check for insufficient credits
      if (
        meta.kind === 'insufficient_credits' ||
        meta.code === 'INSUFFICIENT_CREDITS' ||
        meta.status === 402
      ) {
        setInsufficientDialogOpen(true)
      }
      setReportError(meta.message)
    } finally {
      setReportPending(false)
    }
  }, [file, t])

  return {
    // State
    file,
    profileResult,
    reportResult,
    reportPending,
    reportError,
    insufficientDialogOpen,

    // Upload state
    pending,
    progress,
    error,
    errorMeta,
    inputPreviewUrl,
    hasResult,
    runState,
    visualization,

    // Feature highlight
    highlightedFeature,
    setHighlightedFeature,

    // Actions
    setInsufficientDialogOpen,
    handleFileSelect,
    handleAnalyze,
    handleReportAnalyze,
    retry,
  }
}
