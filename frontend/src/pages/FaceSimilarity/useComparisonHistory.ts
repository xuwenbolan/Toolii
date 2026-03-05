import { useCallback, useSyncExternalStore } from 'react'

const STORAGE_KEY = 'toolii:face-similarity-history'
const MAX_ENTRIES = 20
const THUMB_SIZE = 48

export type HistoryEntry = {
  id: string
  timestamp: number
  overall_score: number
  title: string
  thumb1: string | null
  thumb2: string | null
}

// ---------------------------------------------------------------------------
// External store for cross-component reactivity
// ---------------------------------------------------------------------------

let listeners: Array<() => void> = []
let cachedSnapshot: HistoryEntry[] | null = null
let cachedRaw: string | null = null

const EMPTY: HistoryEntry[] = []

function subscribe(listener: () => void) {
  listeners = [...listeners, listener]
  return () => {
    listeners = listeners.filter((l) => l !== listener)
  }
}
function getSnapshot(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    // Return cached array if raw string unchanged (referential stability)
    if (raw === cachedRaw && cachedSnapshot) return cachedSnapshot
    cachedRaw = raw
    cachedSnapshot = JSON.parse(raw) as HistoryEntry[]
    return cachedSnapshot
  } catch {
    return EMPTY
  }
}

function setEntries(entries: HistoryEntry[]) {
  const json = JSON.stringify(entries)
  localStorage.setItem(STORAGE_KEY, json)
  // Update cache immediately for consistent reads
  cachedRaw = json
  cachedSnapshot = entries
  for (const l of listeners) l()
}

// ---------------------------------------------------------------------------
// Thumbnail generation
// ---------------------------------------------------------------------------

function fileToThumbnail(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = THUMB_SIZE
      canvas.height = THUMB_SIZE
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        resolve(null)
        return
      }
      // Center-crop to square
      const size = Math.min(img.width, img.height)
      const sx = (img.width - size) / 2
      const sy = (img.height - size) / 2
      ctx.drawImage(img, sx, sy, size, size, 0, 0, THUMB_SIZE, THUMB_SIZE)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.6))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useComparisonHistory() {
  const entries = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const addEntry = useCallback(
    async (overall_score: number, title: string, file1: File | null, file2: File | null) => {
      const [thumb1, thumb2] = await Promise.all([
        file1 ? fileToThumbnail(file1) : Promise.resolve(null),
        file2 ? fileToThumbnail(file2) : Promise.resolve(null),
      ])

      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        overall_score,
        title,
        thumb1,
        thumb2,
      }

      const current = getSnapshot()
      const updated = [entry, ...current].slice(0, MAX_ENTRIES)
      setEntries(updated)
    },
    [],
  )

  const clearHistory = useCallback(() => {
    setEntries([])
  }, [])

  return { entries, addEntry, clearHistory }
}
