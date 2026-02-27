import { useCallback } from 'react'

import { isWeChat } from '@/lib/wechat'

export function useFileDownload() {
  return useCallback((url: string) => {
    if (!url) return

    if (isWeChat()) {
      window.location.href = url
      return
    }

    window.open(url, '_blank', 'noopener,noreferrer')
  }, [])
}

