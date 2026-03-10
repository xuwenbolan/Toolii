import { useEffect, useRef, useState } from 'react'

import { api } from '@/services/api'

/**
 * Fetches a lightweight WebP thumbnail via the /thumb endpoint.
 * Falls back silently on 404 (no thumbnail available).
 * Cleans up the object URL on unmount.
 */
export function useFileThumbnail(
  fileId: number,
  contentType: string,
  enabled: boolean,
) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const urlRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || !contentType.startsWith('image/')) return

    let cancelled = false
    setUrl(null)
    setLoading(true)

    api
      .get(`/api/hub/files/${fileId}/thumb`, { responseType: 'blob' })
      .then((res) => {
        if (cancelled) return
        const objectUrl = URL.createObjectURL(res.data)
        urlRef.current = objectUrl
        setUrl(objectUrl)
      })
      .catch(() => {
        // Silently fail — icon fallback will show
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current)
        urlRef.current = null
      }
    }
  }, [fileId, contentType, enabled])

  return { url, loading }
}
