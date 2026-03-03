import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useFileUpload } from '@/hooks/useFileUpload'
import { useObjectUrl } from '@/hooks/useObjectUrl'
import { precompressImage } from '@/lib/imageCompressor'
import {
  compareFaces,
  createSimilarityShare,
  type FaceSimilarityResponse,
} from '@/services/faceMapApi'

export function useFaceSimilarityState() {
  const { t, i18n } = useTranslation('faceSimilarity')
  const [file1, setFile1] = useState<File | null>(null)
  const [file2, setFile2] = useState<File | null>(null)
  const [result, setResult] = useState<FaceSimilarityResponse | null>(null)

  const { pending, progress, error, errorMeta, reset, run, retry } = useFileUpload()

  const previewUrl1 = useObjectUrl(file1)
  const previewUrl2 = useObjectUrl(file2)

  const hasBothFiles = Boolean(file1) && Boolean(file2)
  const hasResult = Boolean(result)

  // Share state
  const [sharePending, setSharePending] = useState(false)
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [shareUrl, setShareUrl] = useState('')

  const handleFile1Select = useCallback(
    (files: File[]) => {
      reset()
      setResult(null)
      setFile1(files[0] ?? null)
    },
    [reset],
  )

  const handleFile2Select = useCallback(
    (files: File[]) => {
      reset()
      setResult(null)
      setFile2(files[0] ?? null)
    },
    [reset],
  )

  const handleCompare = useCallback(async () => {
    if (!file1 || !file2) return
    setResult(null)

    try {
      const [c1, c2] = await Promise.all([
        precompressImage(file1, { maxSizeMB: 2, maxWidthOrHeight: 2048 }),
        precompressImage(file2, { maxSizeMB: 2, maxWidthOrHeight: 2048 }),
      ])
      const res = await run((onProgress) => compareFaces(c1, c2, onProgress))
      setResult(res)
    } catch {
      // handled by useFileUpload
    }
  }, [file1, file2, run])

  const handleShare = useCallback(async () => {
    if (!result || !file1 || !file2) return
    setSharePending(true)
    try {
      const locale = i18n.language.startsWith('en') ? 'en' : 'zh-CN'
      const res = await createSimilarityShare(
        file1,
        file2,
        JSON.stringify(result),
        locale,
      )
      const url = res.share_url
      setShareUrl(url)
      // Try native share first (mobile), fall back to dialog
      if (navigator.share) {
        try {
          await navigator.share({ url, title: t('title') })
          return
        } catch {
          // User cancelled or API failed
        }
      }
      setShareDialogOpen(true)
    } catch {
      toast.error(t('share.createFailed'))
    } finally {
      setSharePending(false)
    }
  }, [result, file1, file2, i18n.language, t])

  const handleReset = useCallback(() => {
    reset()
    setFile1(null)
    setFile2(null)
    setResult(null)
    setShareUrl('')
  }, [reset])

  return {
    file1,
    file2,
    result,
    pending,
    progress,
    error,
    errorMeta,
    previewUrl1,
    previewUrl2,
    hasBothFiles,
    hasResult,
    handleFile1Select,
    handleFile2Select,
    handleCompare,
    handleReset,
    retry,
    // Share
    sharePending,
    shareDialogOpen,
    setShareDialogOpen,
    shareUrl,
    handleShare,
  }
}
