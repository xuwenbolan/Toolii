import { useEffect, useMemo } from 'react'

export function useObjectUrl(file: File | null): string | null {
  const objectUrl = useMemo(() => {
    if (!file) return null
    return URL.createObjectURL(file)
  }, [file])

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [objectUrl])

  return objectUrl
}
