import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBlocker, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  Download,
  EllipsisVertical,
  Loader2,
  PanelLeft,
  Pencil,
  Printer,
  Redo2,
  RefreshCw,
  Save,
  Undo2,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { EditorStatusBar } from '@/components/editor/EditorStatusBar'
import { SEOHead } from '@/components/common/SEOHead'
import { Skeleton } from '@/components/ui/skeleton'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { getTranslatedApiError } from '@/lib/apiErrors'
import {
  getFileContent,
  getFileMeta,
  renameFile,
  saveFileContent,
  uploadEditorImage,
  type UserFileDetailResponse,
} from '@/services/hubApi'
import { precompressImage } from '@/lib/imageCompressor'
import type { TyporaEditorHandle } from '@/components/editor/TyporaEditor'

const AUTOSAVE_DELAY = 60_000
const CONTENT_SYNC_DELAY = 300
const RETRY_DELAY = 30_000
const MAX_BYTES = 1024 * 1024
const WARN_BYTES = 900 * 1024
const SAVE_RETRY_DELAYS = [5_000, 15_000, 45_000]
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

const TyporaEditor = lazy(() =>
  import('@/components/editor/TyporaEditor').then((module) => ({ default: module.TyporaEditor })),
)
const EditorOutline = lazy(() =>
  import('@/components/editor/EditorOutline').then((module) => ({ default: module.EditorOutline })),
)

const _encoder = new TextEncoder()
function byteLength(value: string) {
  return _encoder.encode(value).length
}

function getInitialOutlineOpen(): boolean {
  try {
    return localStorage.getItem('doc-outline-open') !== 'false' && window.innerWidth >= 1024
  } catch {
    return window.innerWidth >= 1024
  }
}

export function DocEditorPage() {
  const { id = '' } = useParams()
  const fileId = Number(id)
  const navigate = useNavigate()
  const { t } = useTranslation('docs')
  const { t: tCommon } = useTranslation('common')
  const [editorRevision, setEditorRevision] = useState(0)

  const [meta, setMeta] = useState<UserFileDetailResponse | null>(null)
  const [fileNameDraft, setFileNameDraft] = useState('')
  const [isEditingName, setIsEditingName] = useState(false)
  const [content, setContent] = useState('')
  const [lastSavedContent, setLastSavedContent] = useState('')
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [renamePending, setRenamePending] = useState(false)
  const [conflictOpen, setConflictOpen] = useState(false)
  const [leavingOpen, setLeavingOpen] = useState(false)
  const [rateLimited, setRateLimited] = useState(false)
  const [outlineOpen, setOutlineOpen] = useState(getInitialOutlineOpen)
  const [scrolled, setScrolled] = useState(false)
  const [saveFlash, setSaveFlash] = useState(false)
  const editorRef = useRef<TyporaEditorHandle>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const saveFlashTimerRef = useRef<number>(0)

  // -- Debounced content sync --
  // contentRef always holds the latest markdown (updated on every keystroke).
  // content state is synced with a delay to avoid per-keystroke re-renders
  // that trigger expensive computations (byteLength, wordCount, parseHeadings).
  const contentRef = useRef('')
  const lastSavedContentRef = useRef('')
  useEffect(() => { lastSavedContentRef.current = lastSavedContent }, [lastSavedContent])
  const updatedAtRef = useRef<string | null>(null)
  useEffect(() => { updatedAtRef.current = updatedAt }, [updatedAt])
  const tRef = useRef(t)
  useEffect(() => { tRef.current = t }, [t])
  const debounceSyncRef = useRef<number>(0)
  const savingGuardRef = useRef(false)

  const isDirty = content !== lastSavedContent
  const currentBytes = useMemo(() => byteLength(content), [content])
  const isOversize = currentBytes > MAX_BYTES
  const isApproachingLimit = !isOversize && currentBytes > WARN_BYTES
  const autoSaveTimerRef = useRef<number>(0)
  const retryTimerRef = useRef<number>(0)
  const saveRetryTimerRef = useRef<number>(0)
  const saveRetryCountRef = useRef(0)
  const pendingUploadsRef = useRef(0)
  const pendingLeaveRef = useRef<(() => void) | null>(null)

  // Called by TyporaEditor on every keystroke. Updates the ref immediately
  // but debounces the React state update to reduce re-renders.
  const handleContentChange = useCallback((markdown: string) => {
    contentRef.current = markdown
    window.clearTimeout(debounceSyncRef.current)
    debounceSyncRef.current = window.setTimeout(() => {
      setContent(markdown)
    }, CONTENT_SYNC_DELAY)
  }, [])

  const handleImageUpload = useCallback(async (file: File): Promise<string> => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error(tRef.current('imageNotImage'))
      return ''
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(tRef.current('imageTooLarge'))
      return ''
    }
    pendingUploadsRef.current++
    try {
      // Compress large images before upload (skip GIF to preserve animation)
      const compressed = file.type === 'image/gif'
        ? file
        : await precompressImage(file, { maxSizeMB: 5, maxWidthOrHeight: 1920 })
      const { url } = await uploadEditorImage(fileId, compressed)
      return url
    } catch {
      toast.error(tRef.current('imageUploadFailed'))
      return ''
    } finally {
      pendingUploadsRef.current--
    }
  }, [fileId])

  const saveStatus = loading
    ? 'loading' as const
    : saving
      ? 'saving' as const
      : saveError
        ? 'error' as const
        : isDirty
          ? 'unsaved' as const
          : 'saved' as const

  const toggleOutline = useCallback(() => {
    setOutlineOpen((prev) => {
      const next = !prev
      try { localStorage.setItem('doc-outline-open', String(next)) } catch { /* ignore */ }
      return next
    })
  }, [])

  const loadDocument = useCallback(async () => {
    if (!Number.isFinite(fileId)) {
      setError(tRef.current('loadFailed'))
      setLoading(false)
      return
    }
    // Cancel any pending debounced content sync to prevent stale overwrites
    window.clearTimeout(debounceSyncRef.current)
    setLoading(true)
    setError(null)
    try {
      const [file, body] = await Promise.all([getFileMeta(fileId), getFileContent(fileId)])
      setMeta(file)
      setFileNameDraft(file.file_name)
      contentRef.current = body.content
      setContent(body.content)
      setLastSavedContent(body.content)
      setUpdatedAt(body.updated_at)
      setSaveError(null)
      setEditorRevision((prev) => prev + 1)
    } catch (err) {
      setError(getTranslatedApiError(err, tRef.current('loadFailed')))
    } finally {
      setLoading(false)
    }
  }, [fileId])

  useEffect(() => {
    void loadDocument()
  }, [loadDocument])

  // Header scroll shadow
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      window.clearTimeout(retryTimerRef.current)
      window.clearTimeout(debounceSyncRef.current)
      window.clearTimeout(saveFlashTimerRef.current)
      window.clearTimeout(saveRetryTimerRef.current)
    }
  }, [])

  // Reads the latest content from ref (not stale state) and saves it.
  // Uses savingGuardRef to prevent concurrent saves without depending on
  // the saving state (which would cause unnecessary useCallback recreation).
  const handleSave = useCallback(async () => {
    if (savingGuardRef.current || loading) return

    // Wait for in-progress image uploads (up to 10s); abort save if still pending
    if (pendingUploadsRef.current > 0) {
      const allUploaded = await new Promise<boolean>((resolve) => {
        let settled = false
        const settle = (v: boolean) => { if (!settled) { settled = true; resolve(v) } }
        const check = () => {
          if (settled) return
          if (pendingUploadsRef.current === 0) return settle(true)
          setTimeout(check, 200)
        }
        check()
        setTimeout(() => settle(false), 10_000)
      })
      if (!allUploaded) {
        toast.warning(tRef.current('imageUploadPending'))
        return
      }
    }

    const latestContent = contentRef.current
    if (latestContent === lastSavedContentRef.current) return
    if (byteLength(latestContent) > MAX_BYTES) return

    // Flush pending debounce so UI reflects the content we're saving
    window.clearTimeout(debounceSyncRef.current)
    setContent(latestContent)

    savingGuardRef.current = true
    setSaving(true)
    setSaveError(null)
    try {
      const result = await saveFileContent(fileId, latestContent, updatedAtRef.current)
      setUpdatedAt(result.updated_at)
      setLastSavedContent(latestContent)
      setMeta((prev) => (prev ? { ...prev, size: result.size, updated_at: result.updated_at } : prev))
      saveRetryCountRef.current = 0
      window.clearTimeout(saveRetryTimerRef.current)
      setSaveFlash(true)
      window.clearTimeout(saveFlashTimerRef.current)
      saveFlashTimerRef.current = window.setTimeout(() => setSaveFlash(false), 1500)
      if (pendingLeaveRef.current) {
        const leave = pendingLeaveRef.current
        pendingLeaveRef.current = null
        leave()
      }
    } catch (err) {
      pendingLeaveRef.current = null
      const status = (err as { response?: { status?: number } })?.response?.status
      const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code
      if (code === 'CONTENT_CONFLICT') {
        setConflictOpen(true)
      } else if (status === 429) {
        setRateLimited(true)
        window.clearTimeout(retryTimerRef.current)
        retryTimerRef.current = window.setTimeout(() => {
          setRateLimited(false)
        }, RETRY_DELAY)
      } else {
        setSaveError(getTranslatedApiError(err, tRef.current('saveFailed')))
        // Schedule auto-retry with exponential backoff
        const retryIdx = saveRetryCountRef.current
        if (retryIdx < SAVE_RETRY_DELAYS.length) {
          saveRetryCountRef.current = retryIdx + 1
          window.clearTimeout(saveRetryTimerRef.current)
          saveRetryTimerRef.current = window.setTimeout(() => {
            void handleSave()
          }, SAVE_RETRY_DELAYS[retryIdx])
        } else {
          toast.error(tRef.current('saveRetriesExhausted'))
        }
      }
    } finally {
      savingGuardRef.current = false
      setSaving(false)
    }
  }, [fileId, loading])

  // Auto-save: starts when debounced content makes isDirty true
  useEffect(() => {
    if (!isDirty || loading || saving || isOversize || conflictOpen || rateLimited) return
    autoSaveTimerRef.current = window.setTimeout(() => {
      void handleSave()
    }, AUTOSAVE_DELAY)
    return () => window.clearTimeout(autoSaveTimerRef.current)
  }, [conflictOpen, handleSave, isDirty, isOversize, loading, rateLimited, saving])

  // Check refs for accurate dirty state even if debounce hasn't flushed yet
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (contentRef.current === lastSavedContentRef.current || savingGuardRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  const renameCancelledRef = useRef(false)
  const renameCommittingRef = useRef(false)

  const handleRenameCommit = useCallback(async () => {
    if (renameCancelledRef.current) {
      renameCancelledRef.current = false
      return
    }
    if (renameCommittingRef.current) return
    setIsEditingName(false)
    let nextName = fileNameDraft.trim()
    if (!meta || !nextName || renamePending) return
    // Auto-append .md if user removed it
    if (!nextName.toLowerCase().endsWith('.md')) {
      nextName = `${nextName}.md`
      setFileNameDraft(nextName)
    }
    if (nextName === meta.file_name) return
    renameCommittingRef.current = true
    setRenamePending(true)
    try {
      const renamed = await renameFile(meta.id, nextName)
      setMeta({ ...meta, file_name: renamed.file_name })
      setFileNameDraft(renamed.file_name)
    } catch (err) {
      const fallback = getTranslatedApiError(err, tRef.current('renameFailed'))
      toast.error(fallback)
      setFileNameDraft(meta.file_name)
    } finally {
      renameCommittingRef.current = false
      setRenamePending(false)
    }
  }, [fileNameDraft, meta, renamePending])

  const startRename = useCallback(() => {
    setIsEditingName(true)
    requestAnimationFrame(() => {
      const input = nameInputRef.current
      if (!input) return
      // Select only the name part before .md extension
      const val = input.value
      const dotIdx = val.lastIndexOf('.md')
      if (dotIdx > 0) {
        input.setSelectionRange(0, dotIdx)
      } else {
        input.select()
      }
    })
  }, [])

  const handleReloadClick = useCallback(() => {
    if (contentRef.current !== lastSavedContentRef.current) {
      if (!window.confirm(tRef.current('reloadConfirm'))) return
    }
    void loadDocument()
  }, [loadDocument])

  const handleReloadLatest = useCallback(async () => {
    setConflictOpen(false)
    await loadDocument()
  }, [loadDocument])

  // Use a function so the blocker always reads the latest ref values,
  // even if the debounced state hasn't caught up yet.
  const blocker = useBlocker(() => contentRef.current !== lastSavedContentRef.current)

  const handleBack = useCallback(() => {
    if (contentRef.current !== lastSavedContentRef.current) {
      setLeavingOpen(true)
      return
    }
    navigate('/dashboard/hub')
  }, [navigate])

  // Called once on editor init with the round-trip normalized markdown.
  // Syncs both content and lastSavedContent to prevent false dirty state.
  const handleNormalized = useCallback((markdown: string) => {
    contentRef.current = markdown
    setContent(markdown)
    setLastSavedContent(markdown)
  }, [])

  const handleExportMd = useCallback(() => {
    const latest = contentRef.current
    const blob = new Blob([latest], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = meta?.file_name ?? 'document.md'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, [meta?.file_name])

  // Print the editor directly — ProseMirror DOM already has the latest content.
  const handlePrint = useCallback(() => {
    window.print()
  }, [])

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key === 's') {
        e.preventDefault()
        window.clearTimeout(autoSaveTimerRef.current)
        window.clearTimeout(retryTimerRef.current)
        window.clearTimeout(saveRetryTimerRef.current)
        saveRetryCountRef.current = 0
        void handleSave()
      } else if (mod && e.key === 'p') {
        e.preventDefault()
        handlePrint()
      } else if (mod && e.shiftKey && e.key === 'S') {
        e.preventDefault()
        handleExportMd()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleExportMd, handlePrint, handleSave])

  return (
    <>
      <SEOHead title={meta ? `${meta.file_name} - ${t('seoTitle')}` : t('seoTitle')} noindex />

      <TooltipProvider delayDuration={400}>
        <div className="flex min-h-svh flex-col bg-background text-foreground print:min-h-0 print:bg-white">
          {/* -- Header -- */}
          <header className={[
            'sticky top-0 z-30 border-b border-border/40 bg-background/80 backdrop-blur-sm transition-shadow duration-200 print:hidden',
            scrolled ? 'shadow-sm' : '',
          ].join(' ')}>
            <div className="mx-auto flex h-11 max-w-[1600px] items-center gap-1 px-2 sm:px-3 lg:px-4">
              {/* Back */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleBack}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    aria-label={t('backToHub')}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t('backToHub')}</TooltipContent>
              </Tooltip>

              {/* Outline toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={toggleOutline}
                    className={[
                      'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition',
                      outlineOpen
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    ].join(' ')}
                    aria-label={t('outline')}
                  >
                    <PanelLeft className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t('outline')}</TooltipContent>
              </Tooltip>

              {/* Undo / Redo */}
              <div className="flex items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => editorRef.current?.undo()}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
                      aria-label={t('undo')}
                    >
                      <Undo2 className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{t('undo')} <kbd className="ml-1 text-[10px] opacity-60">Ctrl+Z</kbd></TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => editorRef.current?.redo()}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
                      aria-label={t('redo')}
                    >
                      <Redo2 className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{t('redo')} <kbd className="ml-1 text-[10px] opacity-60">Ctrl+Shift+Z</kbd></TooltipContent>
                </Tooltip>
              </div>

              {/* File name */}
              <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-1">
                {isEditingName ? (
                  <Input
                    ref={nameInputRef}
                    value={fileNameDraft}
                    onChange={(event) => setFileNameDraft(event.target.value)}
                    onBlur={() => { void handleRenameCommit() }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        // Blur triggers onBlur→handleRenameCommit; no need to call twice.
                        // renameCommittingRef prevents double execution if blur fires separately.
                        ;(event.target as HTMLInputElement).blur()
                      }
                      if (event.key === 'Escape') {
                        renameCancelledRef.current = true
                        setIsEditingName(false)
                        if (meta) setFileNameDraft(meta.file_name)
                      }
                    }}
                    className="h-7 max-w-xs border-border/60 bg-background px-2 text-sm font-medium shadow-sm"
                    disabled={!meta || renamePending}
                    aria-label={t('fileName')}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={startRename}
                    disabled={!meta || renamePending}
                    className="group flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-sm font-medium transition hover:bg-muted disabled:pointer-events-none"
                  >
                    <span className="truncate">{fileNameDraft || t('untitled')}</span>
                    <Pencil className="h-3 w-3 shrink-0 text-muted-foreground opacity-40 transition group-hover:opacity-100" />
                  </button>
                )}
              </div>

              {/* Desktop action buttons */}
              <div className="hidden items-center gap-0.5 sm:flex">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={handleExportMd}
                      aria-label={t('exportMd')}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{t('exportMd')} <kbd className="ml-1 text-[10px] opacity-60">Ctrl+Shift+S</kbd></TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={handlePrint}
                      aria-label={t('print')}
                    >
                      <Printer className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{t('print')} <kbd className="ml-1 text-[10px] opacity-60">Ctrl+P</kbd></TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                      onClick={handleReloadClick}
                      disabled={loading}
                      aria-label={t('reload')}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{t('reload')}</TooltipContent>
                </Tooltip>
              </div>

              {/* Save button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    disabled={(!isDirty || isOversize || saving || loading) && !saveFlash}
                    onClick={() => { void handleSave() }}
                    className={[
                      'h-7 gap-1 px-2.5 text-xs transition-colors duration-300',
                      saveFlash ? '!bg-success/20 !text-success !opacity-100' : '',
                    ].join(' ')}
                  >
                    {saveFlash
                      ? <Check className="h-3.5 w-3.5" />
                      : saving
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Save className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">{saveFlash ? t('saved') : t('saveNow')}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Ctrl+S</TooltipContent>
              </Tooltip>

              {/* Mobile-only: overflow menu for export, print, reload */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0 sm:hidden">
                    <EllipsisVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-36">
                  <DropdownMenuItem onClick={handleExportMd}>
                    <Download className="mr-2 h-4 w-4" />
                    {t('exportMd')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handlePrint}>
                    <Printer className="mr-2 h-4 w-4" />
                    {t('print')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleReloadClick} disabled={loading}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {t('reload')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* -- Main content area -- */}
          {loading ? (
            <EditorSkeleton />
          ) : error ? (
            <div className="flex min-h-[60vh] items-center justify-center print:hidden">
              <Card className="w-full max-w-lg rounded-2xl border-destructive/30">
                <CardContent className="space-y-4 p-8 text-center">
                  <p className="text-lg font-semibold">{t('loadErrorTitle')}</p>
                  <p className="text-sm text-muted-foreground">{error}</p>
                  <div className="flex justify-center gap-2">
                    <Button type="button" onClick={() => { void loadDocument() }}>{t('reload')}</Button>
                    <Button type="button" variant="outline" onClick={() => navigate('/dashboard/hub')}>{tCommon('actions.back')}</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 animate-in fade-in duration-300">
              {/* Outline sidebar - always rendered for smooth transition */}
              <Suspense fallback={null}>
                <EditorOutline content={content} open={outlineOpen} />
              </Suspense>

              {/* Editor */}
              <div className="min-h-0 min-w-0 flex-1">
                <Suspense fallback={<EditorSkeleton />}>
                  <TyporaEditor
                    ref={editorRef}
                    key={`${fileId}:${editorRevision}`}
                    initialContent={content}
                    placeholder={t('wysiwygHint')}
                    onChange={handleContentChange}
                    onNormalized={handleNormalized}
                    onImageUpload={handleImageUpload}
                  />
                </Suspense>
              </div>
            </div>
          )}

          {/* -- Bottom status bar -- */}
          <EditorStatusBar
            content={content}
            currentBytes={currentBytes}
            maxBytes={MAX_BYTES}
            saveStatus={saveStatus}
            saveError={saveError}
            savedTime={updatedAt}
            isApproachingLimit={isApproachingLimit}
            isOversize={isOversize}
            saveFlash={saveFlash}
          />
        </div>
      </TooltipProvider>

      <AlertDialog open={conflictOpen} onOpenChange={setConflictOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('conflictTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('conflictDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(contentRef.current)
                  .then(() => toast.success(tRef.current('copiedToClipboard')))
                  .catch(() => toast.error(tRef.current('copyFailed')))
              }}
            >
              {t('copyContent')}
            </Button>
            <AlertDialogCancel>{t('keepEditing')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { void handleReloadLatest() }}>{t('reloadLatest')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LeaveDialog
        open={leavingOpen || blocker.state === 'blocked'}
        onSaveAndLeave={() => {
          const destination = blocker.state === 'blocked'
            ? blocker.location.pathname + blocker.location.search
            : '/dashboard/hub'
          setLeavingOpen(false)
          if (blocker.state === 'blocked') blocker.reset()
          pendingLeaveRef.current = () => navigate(destination)
          void handleSave()
        }}
        onDiscard={() => {
          // Flush ref to state and mark as "saved" to clear dirty state
          const latest = contentRef.current
          setContent(latest)
          setLastSavedContent(latest)
          setLeavingOpen(false)
          if (blocker.state === 'blocked') blocker.proceed()
          else navigate('/dashboard/hub')
        }}
        onCancel={() => {
          setLeavingOpen(false)
          if (blocker.state === 'blocked') blocker.reset()
        }}
        saving={saving}
        t={t}
      />
    </>
  )
}

// -- Sub-components --

function EditorSkeleton() {
  const { t } = useTranslation('docs')
  return (
    <div className="mx-auto w-full max-w-[52rem] space-y-6 px-6 py-12 print:hidden">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{t('editorLoading')}</span>
      </div>
      <Skeleton className="h-9 w-2/5" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  )
}

function LeaveDialog({
  open,
  onSaveAndLeave,
  onDiscard,
  onCancel,
  saving,
  t,
}: {
  open: boolean
  onSaveAndLeave: () => void
  onDiscard: () => void
  onCancel: () => void
  saving: boolean
  t: (key: string) => string
}) {
  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) onCancel() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('leaveTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('leaveDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{t('stayHere')}</AlertDialogCancel>
          <AlertDialogAction className={buttonVariants({ variant: 'destructive' })} onClick={onDiscard}>{t('leaveAnyway')}</AlertDialogAction>
          <AlertDialogAction onClick={onSaveAndLeave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t('saveAndLeave')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
