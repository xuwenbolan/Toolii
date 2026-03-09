import { useCallback } from 'react'

import { api } from '@/services/api'
import { isWeChat } from '@/lib/wechat'
import { shareOrDownloadBlob } from '@/lib/shareDownload'

/**
 * Returns an async download function that:
 * 1. Fetches the URL as a Blob via axios (carries Bearer token)
 * 2. Tries Web Share API (mobile: save to photos / share sheet)
 * 3. Falls back to Blob + <a download> trigger
 * 4. Ultimate fallback: window.open / location.href
 */
export function useFileDownload() {
  return useCallback(async (url: string, filename?: string) => {
    if (!url) return

    try {
      const res = await api.get(url, { responseType: 'blob' })

      const blob: Blob = res.data
      const cd = res.headers['content-disposition'] as string | undefined
      const name = filename || filenameFromCd(cd) || `download-${Date.now()}`

      await shareOrDownloadBlob(blob, name)
    } catch {
      // Fetch or share failed — fall back to direct navigation
      if (isWeChat()) {
        window.location.href = url
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
      }
    }
  }, [])
}

function filenameFromCd(cd: string | undefined): string | null {
  if (!cd) return null
  const starMatch = cd.match(/filename\*=UTF-8''([^;\s]+)/i)
  if (starMatch) return decodeURIComponent(starMatch[1])
  const quotedMatch = cd.match(/filename="([^"]+)"/i)
  if (quotedMatch) return quotedMatch[1]
  const bareMatch = cd.match(/filename=([^;\s]+)/i)
  if (bareMatch) return bareMatch[1]
  return null
}
