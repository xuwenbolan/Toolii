import { useCallback, useMemo, useRef, useState } from 'react'

export type PageEntry = {
  id: string
  sourceFileIndex: number
  pageNumber: number
  globalPageNumber: number
  rotation: number // 0, 90, 180, 270
}

export function usePdfWorkspace() {
  const [sourceFiles, setSourceFiles] = useState<File[]>([])
  const [pages, setPages] = useState<PageEntry[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [edited, setEdited] = useState(false)

  const pagesRef = useRef<PageEntry[]>([])
  pagesRef.current = pages
  const lastClickedRef = useRef<string | null>(null)
  const addedFilesRef = useRef<Set<number>>(new Set())

  const addFiles = useCallback((files: File[]) => {
    setSourceFiles((prev) => [...prev, ...files])
  }, [])

  // Called when thumbnail hook detects page counts for newly added files.
  const syncPageCounts = useCallback((pageCounts: Map<number, number>, fileCount: number) => {
    for (let fi = 0; fi < fileCount; fi++) {
      if (addedFilesRef.current.has(fi)) continue
      const count = pageCounts.get(fi)
      if (count == null || count === 0) continue

      addedFilesRef.current.add(fi)
      setPages((prev) => {
        const maxGlobal = prev.length > 0 ? Math.max(...prev.map((p) => p.globalPageNumber)) : 0
        const entries: PageEntry[] = []
        for (let pn = 1; pn <= count; pn++) {
          entries.push({
            id: `f${fi}-p${pn}`,
            sourceFileIndex: fi,
            pageNumber: pn,
            globalPageNumber: maxGlobal + pn,
            rotation: 0,
          })
        }
        return [...prev, ...entries]
      })
    }
  }, [])

  const reorderPages = useCallback((reordered: PageEntry[]) => {
    setPages(reordered)
    setEdited(true)
  }, [])

  const deleteSelected = useCallback(() => {
    setSelectedIds((sel) => {
      setPages((prev) => prev.filter((p) => !sel.has(p.id)))
      return new Set()
    })
    setEdited(true)
    lastClickedRef.current = null
  }, [])

  const rotateSelected = useCallback((angle: number) => {
    setSelectedIds((sel) => {
      if (sel.size === 0) return sel
      setPages((prev) =>
        prev.map((p) =>
          sel.has(p.id) ? { ...p, rotation: ((p.rotation + angle) % 360 + 360) % 360 } : p,
        ),
      )
      setEdited(true)
      return sel
    })
  }, [])

  const rotatePage = useCallback((id: string, angle: number) => {
    setPages((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, rotation: ((p.rotation + angle) % 360 + 360) % 360 } : p,
      ),
    )
    setEdited(true)
  }, [])

  const deletePage = useCallback((id: string) => {
    setPages((prev) => prev.filter((p) => p.id !== id))
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setEdited(true)
  }, [])

  const toggleSelect = useCallback((id: string, shiftKey = false) => {
    if (shiftKey && lastClickedRef.current) {
      const current = pagesRef.current
      const lastIdx = current.findIndex((p) => p.id === lastClickedRef.current)
      const toIdx = current.findIndex((p) => p.id === id)
      if (lastIdx !== -1 && toIdx !== -1) {
        const from = Math.min(lastIdx, toIdx)
        const to = Math.max(lastIdx, toIdx)
        setSelectedIds((prev) => {
          const next = new Set(prev)
          for (let i = from; i <= to; i++) next.add(current[i].id)
          return next
        })
        lastClickedRef.current = id
        return
      }
    }
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    lastClickedRef.current = id
  }, [])

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(pagesRef.current.map((p) => p.id)))
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
    lastClickedRef.current = null
  }, [])

  const clearWorkspace = useCallback(() => {
    setSourceFiles([])
    setPages([])
    setSelectedIds(new Set())
    setEdited(false)
    addedFilesRef.current = new Set()
    lastClickedRef.current = null
  }, [])

  const totalOriginalPages = useMemo(() => {
    if (pages.length === 0) return 0
    return Math.max(...pages.map((p) => p.globalPageNumber), 0)
  }, [pages])

  const hasEdits = edited

  return {
    sourceFiles,
    pages,
    selectedIds,
    hasEdits,
    totalOriginalPages,
    addFiles,
    syncPageCounts,
    reorderPages,
    deleteSelected,
    rotateSelected,
    rotatePage,
    deletePage,
    toggleSelect,
    selectAll,
    clearSelection,
    clearWorkspace,
  }
}
