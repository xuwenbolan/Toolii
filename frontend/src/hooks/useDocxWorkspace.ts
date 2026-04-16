import { useCallback, useEffect, useRef, useState } from 'react'
import { analyzeDocx } from '@/services/docxApi'
import type { DocxAnalysisResult } from '@/services/docxApi'

export type DocxFileEntry = {
  id: string
  file: File
  analysis: DocxAnalysisResult | null
  analysisLoading: boolean
  analysisError: string | null
  selectedIssues: Set<string>
}

let _nextId = 0
function genId() {
  return `docx-${++_nextId}-${Date.now()}`
}

export function useDocxWorkspace() {
  const [entries, setEntries] = useState<DocxFileEntry[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const analyzeControllers = useRef<Map<string, AbortController>>(new Map())

  // Abort every in-flight analyze request when the host component
  // unmounts. Without this, the fetch `.then()` / `.catch()` callbacks
  // keep running and call `setEntries` on an unmounted component,
  // producing the "can't perform a React state update" warning and
  // leaking the request until the network completes.
  useEffect(() => {
    const controllers = analyzeControllers.current
    return () => {
      for (const controller of controllers.values()) {
        controller.abort()
      }
      controllers.clear()
    }
  }, [])

  const activeEntry = entries.find((e) => e.id === activeId) ?? entries[0] ?? null
  const isMergeMode = entries.length >= 2

  // Internal helper: trigger analysis for a single entry
  const _triggerAnalysis = useCallback((entryId: string, file: File) => {
    // Cancel any existing analysis for this entry
    const existing = analyzeControllers.current.get(entryId)
    if (existing) existing.abort()

    const controller = new AbortController()
    analyzeControllers.current.set(entryId, controller)

    analyzeDocx(file, undefined, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        setEntries((prev) =>
          prev.map((e) =>
            e.id === entryId
              ? {
                  ...e,
                  analysis: result,
                  analysisLoading: false,
                  selectedIssues: new Set(result.issues.map((i) => i.code)),
                }
              : e,
          ),
        )
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        const message = err instanceof Error ? err.message : String(err)
        setEntries((prev) =>
          prev.map((e) =>
            e.id === entryId
              ? { ...e, analysisLoading: false, analysisError: message || 'Analysis failed' }
              : e,
          ),
        )
      })
  }, [])

  const addFiles = useCallback((files: File[]) => {
    const newEntries: DocxFileEntry[] = files.map((file) => ({
      id: genId(),
      file,
      analysis: null,
      analysisLoading: true,
      analysisError: null,
      selectedIssues: new Set<string>(),
    }))

    setEntries((prev) => [...prev, ...newEntries])

    // Functional update avoids a stale-closure race: `activeId` captured
    // in the deps list can lag behind the real state when addFiles is
    // called in quick succession (e.g. multi-select upload), which left
    // the first file un-activated even though no file was currently active.
    if (newEntries.length > 0) {
      setActiveId((prev) => (prev === null ? newEntries[0].id : prev))
    }

    // Trigger analysis for each new file
    for (const entry of newEntries) {
      _triggerAnalysis(entry.id, entry.file)
    }
  }, [_triggerAnalysis])

  const removeFile = useCallback((id: string) => {
    const controller = analyzeControllers.current.get(id)
    if (controller) {
      controller.abort()
      analyzeControllers.current.delete(id)
    }
    setEntries((prev) => prev.filter((e) => e.id !== id))
    setActiveId((prev) => (prev === id ? null : prev))
  }, [])

  const reorderFiles = useCallback((fromIndex: number, toIndex: number) => {
    setEntries((prev) => {
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }, [])

  const toggleIssue = useCallback((entryId: string, code: string) => {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== entryId) return e
        const next = new Set(e.selectedIssues)
        if (next.has(code)) next.delete(code)
        else next.add(code)
        return { ...e, selectedIssues: next }
      }),
    )
  }, [])

  const toggleAllIssues = useCallback((entryId: string) => {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== entryId || !e.analysis) return e
        const allSelected = e.analysis.issues.every((i) => e.selectedIssues.has(i.code))
        return {
          ...e,
          selectedIssues: allSelected
            ? new Set<string>()
            : new Set(e.analysis.issues.map((i) => i.code)),
        }
      }),
    )
  }, [])

  const clearWorkspace = useCallback(() => {
    for (const controller of analyzeControllers.current.values()) {
      controller.abort()
    }
    analyzeControllers.current.clear()
    setEntries([])
    setActiveId(null)
  }, [])

  // Replace a single file (used by the "Replace" button)
  const replaceFile = useCallback((id: string, newFile: File) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id
          ? { ...e, file: newFile, analysis: null, analysisLoading: true, analysisError: null, selectedIssues: new Set<string>() }
          : e,
      ),
    )
    _triggerAnalysis(id, newFile)
  }, [_triggerAnalysis])

  // Re-analyze a file (used after repair to verify fixes)
  const reAnalyze = useCallback((entryId: string, file: File) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entryId
          ? { ...e, file, analysis: null, analysisLoading: true, analysisError: null, selectedIssues: new Set<string>() }
          : e,
      ),
    )
    _triggerAnalysis(entryId, file)
  }, [_triggerAnalysis])

  // Build per-file issues map for merge endpoint
  const getMergeIssuesMap = useCallback((): Record<number, string[]> | undefined => {
    const map: Record<number, string[]> = {}
    entries.forEach((e, i) => {
      if (e.selectedIssues.size > 0) {
        map[i] = [...e.selectedIssues]
      }
    })
    return Object.keys(map).length > 0 ? map : undefined
  }, [entries])

  const hasAnySelectedIssues = entries.some((e) => e.selectedIssues.size > 0)

  return {
    entries,
    activeEntry,
    activeId,
    isMergeMode,
    hasAnySelectedIssues,
    setActiveId,
    addFiles,
    removeFile,
    reorderFiles,
    toggleIssue,
    toggleAllIssues,
    clearWorkspace,
    replaceFile,
    reAnalyze,
    getMergeIssuesMap,
  }
}
