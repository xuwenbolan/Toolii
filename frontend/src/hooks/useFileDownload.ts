import { useCallback } from 'react'

import { isWeChat } from '@/lib/wechat'
import { filenameFromResponse, shareOrDownloadBlob } from '@/lib/shareDownload'

/**
 * Returns an async download function that:
 * 1. Fetches the URL as a Blob
 * 2. Tries Web Share API (mobile: save to photos / share sheet)
 * 3. Falls back to Blob + <a download> trigger
 * 4. Ultimate fallback: window.open / location.href
 */
export function useFileDownload() {
  return useCallback(async (url: string, filename?: string) => {
    if (!url) return

    try {
      const res = await fetch(url, { credentials: 'include' })
      if (!res.ok) throw new Error('fetch-failed')

      const blob = await res.blob()
      const name =
        filename ||
        filenameFromResponse(res) ||
        `download-${Date.now()}`

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
