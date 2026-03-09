import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBlocker, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Download,
  EllipsisVertical,
  Loader2,
  PanelLeft,
  Pencil,
  Printer,
  RefreshCw,
  Save,
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
  type UserFileDetailResponse,
} from '@/services/hubApi'

const AUTOSAVE_DELAY = 60_000
const RETRY_DELAY = 30_000
const MAX_BYTES = 1024 * 1024
const WARN_BYTES = 900 * 1024

const TyporaEditor = lazy(() =>
  import('@/components/editor/TyporaEditor').then((module) => ({ default: module.TyporaEditor })),
)
const EditorOutline = lazy(() =>
  import('@/components/editor/EditorOutline').then((module) => ({ default: module.EditorOutline })),
)

function byteLength(value: string) {
  return new TextEncoder().encode(value).length
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
  const nameInputRef = useRef<HTMLInputElement>(null)

  const isDirty = content !== lastSavedContent
  const currentBytes = useMemo(() => byteLength(content), [content])
  const isOversize = currentBytes > MAX_BYTES
  const isApproachingLimit = !isOversize && currentBytes > WARN_BYTES
  const autoSaveTimerRef = useRef<number>(0)
  const retryTimerRef = useRef<number>(0)
  const pendingLeaveRef = useRef<(() => void) | null>(null)

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
      setError(t('loadFailed'))
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [file, body] = await Promise.all([getFileMeta(fileId), getFileContent(fileId)])
      setMeta(file)
      setFileNameDraft(file.file_name)
      setContent(body.content)
      setLastSavedContent(body.content)
      setUpdatedAt(body.updated_at)
      setSaveError(null)
      setEditorRevision((prev) => prev + 1)
    } catch (err) {
      setError(getTranslatedApiError(err, t('loadFailed')))
    } finally {
      setLoading(false)
    }
  }, [fileId, t])

  useEffect(() => {
    void loadDocument()
  }, [loadDocument])

  // Clean up retry timer on unmount
  useEffect(() => {
    return () => window.clearTimeout(retryTimerRef.current)
  }, [])

  const handleSave = useCallback(async () => {
    if (loading || saving || isOversize || !isDirty) return
    setSaving(true)
    setSaveError(null)
    try {
      const result = await saveFileContent(fileId, content, updatedAt)
      setUpdatedAt(result.updated_at)
      setLastSavedContent(content)
      setMeta((prev) => (prev ? { ...prev, size: result.size, updated_at: result.updated_at } : prev))
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
        setSaveError(getTranslatedApiError(err, t('saveFailed')))
      }
    } finally {
      setSaving(false)
    }
  }, [content, fileId, isDirty, isOversize, loading, saving, t, updatedAt])

  // Auto-save
  useEffect(() => {
    if (!isDirty || loading || saving || isOversize || conflictOpen || rateLimited) return
    autoSaveTimerRef.current = window.setTimeout(() => {
      void handleSave()
    }, AUTOSAVE_DELAY)
    return () => window.clearTimeout(autoSaveTimerRef.current)
  }, [conflictOpen, handleSave, isDirty, isOversize, loading, rateLimited, saving])

  // Ctrl+S / Cmd+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        window.clearTimeout(autoSaveTimerRef.current)
        window.clearTimeout(retryTimerRef.current)
        void handleSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty || saving) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty, saving])

  const handleRenameCommit = useCallback(async () => {
    setIsEditingName(false)
    const nextName = fileNameDraft.trim()
    if (!meta || !nextName || nextName === meta.file_name || renamePending) return
    setRenamePending(true)
    try {
      const renamed = await renameFile(meta.id, nextName)
      setMeta({ ...meta, file_name: renamed.file_name })
      setFileNameDraft(renamed.file_name)
    } catch (err) {
      const fallback = getTranslatedApiError(err, t('renameFailed'))
      toast.error(fallback)
      setFileNameDraft(meta.file_name)
    } finally {
      setRenamePending(false)
    }
  }, [fileNameDraft, meta, renamePending, t])

  const startRename = useCallback(() => {
    setIsEditingName(true)
    requestAnimationFrame(() => nameInputRef.current?.select())
  }, [])

  const handleReloadLatest = useCallback(async () => {
    setConflictOpen(false)
    await loadDocument()
  }, [loadDocument])

  const blocker = useBlocker(isDirty)

  const handleBack = useCallback(() => {
    if (isDirty) {
      setLeavingOpen(true)
      return
    }
    navigate('/dashboard/hub')
  }, [isDirty, navigate])

  // Called once on editor init with the round-trip normalized markdown.
  // Syncs both content and lastSavedContent to prevent false dirty state.
  const handleNormalized = useCallback((markdown: string) => {
    setContent(markdown)
    setLastSavedContent(markdown)
  }, [])

  const handleExportMd = useCallback(() => {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = meta?.file_name ?? 'document.md'
    a.click()
    URL.revokeObjectURL(url)
  }, [content, meta?.file_name])

  return (
    <>
      <SEOHead title={meta ? `${meta.file_name} - ${t('seoTitle')}` : t('seoTitle')} noindex />

      <div className="flex min-h-svh flex-col bg-background text-foreground print:min-h-0 print:bg-white">
        {/* ── Header ── */}
        <header className="sticky top-0 z-30 border-b border-border/40 bg-background/80 backdrop-blur-sm print:hidden">
          <div className="mx-auto flex h-11 max-w-[1600px] items-center gap-1 px-2 sm:px-3 lg:px-4">
            {/* Back */}
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label={t('backToHub')}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>

            {/* Outline toggle */}
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
                      void handleRenameCommit()
                    }
                    if (event.key === 'Escape') {
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
                  <Pencil className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                </button>
              )}
            </div>

            {/* Desktop action buttons */}
            <div className="hidden items-center gap-0.5 sm:flex">
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
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={() => window.print()}
                aria-label={t('exportPdf')}
              >
                <Printer className="h-4 w-4" />
              </Button>
            </div>

            {/* Save button */}
            <Button
              type="button"
              size="sm"
              disabled={!isDirty || isOversize || saving || loading}
              onClick={() => { void handleSave() }}
              className="h-7 gap-1 px-2.5 text-xs"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{t('saveNow')}</span>
            </Button>

            {/* Mobile: more menu with export + reload | Desktop: just reload */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0">
                  <EllipsisVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-36">
                <DropdownMenuItem className="sm:hidden" onClick={handleExportMd}>
                  <Download className="mr-2 h-4 w-4" />
                  {t('exportMd')}
                </DropdownMenuItem>
                <DropdownMenuItem className="sm:hidden" onClick={() => window.print()}>
                  <Printer className="mr-2 h-4 w-4" />
                  {t('exportPdf')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { void loadDocument() }} disabled={loading}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {t('reload')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* ── Main content area ── */}
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
          <div className="flex min-h-0 flex-1">
            {/* Outline sidebar */}
            {outlineOpen && (
              <Suspense fallback={null}>
                <EditorOutline content={content} />
              </Suspense>
            )}

            {/* Editor */}
            <div className="min-h-0 min-w-0 flex-1">
              <Suspense fallback={<EditorSkeleton />}>
                <TyporaEditor
                  key={`${fileId}:${editorRevision}`}
                  initialContent={content}
                  placeholder={t('wysiwygHint')}
                  onChange={setContent}
                  onNormalized={handleNormalized}
                />
              </Suspense>
            </div>
          </div>
        )}

        {/* ── Print preview (hidden, visible only during print) ── */}
        <div className="hidden print:block" id="doc-print-preview">
          <Suspense fallback={null}>
            <MilkdownPrintPreview content={content} />
          </Suspense>
        </div>

        {/* ── Bottom status bar ── */}
        <EditorStatusBar
          content={content}
          currentBytes={currentBytes}
          maxBytes={MAX_BYTES}
          saveStatus={saveStatus}
          saveError={saveError}
          savedTime={updatedAt}
          isApproachingLimit={isApproachingLimit}
          isOversize={isOversize}
        />
      </div>

      <AlertDialog open={conflictOpen} onOpenChange={setConflictOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('conflictTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('conflictDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
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
          setLeavingOpen(false)
          setLastSavedContent(content)
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

// ── Sub-components ──────────────────────────────────────────

function EditorSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[52rem] space-y-6 px-6 py-12 print:hidden">
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

const MilkdownPrintPreview = lazy(() =>
  import('@/components/editor/MilkdownPreview').then((module) => ({ default: module.MilkdownPreview })),
)

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
          <AlertDialogAction className={buttonVariants({ variant: 'outline' })} onClick={onDiscard}>{t('leaveAnyway')}</AlertDialogAction>
          <AlertDialogAction onClick={onSaveAndLeave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t('saveAndLeave')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
