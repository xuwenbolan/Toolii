import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { Loader2, PanelLeftClose, PanelRightClose, Printer, RefreshCw, Save, Undo2 } from 'lucide-react'
import { toast } from 'sonner'

import { SEOHead } from '@/components/common/SEOHead'
import { MarkdownPreview } from '@/components/editor/MarkdownPreview'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { getTranslatedApiError } from '@/lib/apiErrors'
import { cn } from '@/lib/utils'
import {
  getFileContent,
  getFileMeta,
  renameFile,
  saveFileContent,
  type UserFileDetailResponse,
} from '@/services/hubApi'

const AUTOSAVE_DELAY = 1200
const MAX_BYTES = 1024 * 1024

type InsertMode = {
  prefix: string
  suffix?: string
  placeholder?: string
}

function formatTime(value: string | null, locale: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).length
}

function insertMarkdown(
  textarea: HTMLTextAreaElement,
  mode: InsertMode,
  setValue: (next: string) => void,
) {
  const { selectionStart, selectionEnd, value } = textarea
  const selectedText = value.slice(selectionStart, selectionEnd)
  const content = selectedText || mode.placeholder || ''
  const next = `${value.slice(0, selectionStart)}${mode.prefix}${content}${mode.suffix ?? ''}${value.slice(selectionEnd)}`
  setValue(next)

  const start = selectionStart + mode.prefix.length
  const end = start + content.length
  requestAnimationFrame(() => {
    textarea.focus()
    textarea.setSelectionRange(start, end)
  })
}

function buildDefaultContent(title: string) {
  const base = title.replace(/\.md$/i, '')
  return `# ${base}\n\n`
}

export function DocEditorPage() {
  const { id = '' } = useParams()
  const fileId = Number(id)
  const navigate = useNavigate()
  const { t, i18n } = useTranslation('docs')
  const { t: tCommon } = useTranslation('common')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [meta, setMeta] = useState<UserFileDetailResponse | null>(null)
  const [fileNameDraft, setFileNameDraft] = useState('')
  const [content, setContent] = useState('')
  const [lastSavedContent, setLastSavedContent] = useState('')
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [renamePending, setRenamePending] = useState(false)
  const [showPreview, setShowPreview] = useState(true)
  const [conflictOpen, setConflictOpen] = useState(false)
  const [leavingOpen, setLeavingOpen] = useState(false)

  const isDirty = content !== lastSavedContent
  const currentBytes = useMemo(() => byteLength(content), [content])
  const isOversize = currentBytes > MAX_BYTES

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
    } catch (err) {
      setError(getTranslatedApiError(err, t('loadFailed')))
    } finally {
      setLoading(false)
    }
  }, [fileId, t])

  useEffect(() => {
    void loadDocument()
  }, [loadDocument])

  const handleSave = useCallback(async () => {
    if (loading || saving || isOversize || !isDirty) return
    setSaving(true)
    setSaveError(null)
    try {
      const result = await saveFileContent(fileId, content, updatedAt)
      setUpdatedAt(result.updated_at)
      setLastSavedContent(content)
      setMeta((prev) => (prev ? { ...prev, size: currentBytes, updated_at: result.updated_at } : prev))
    } catch (err) {
      const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code
      if (code === 'CONTENT_CONFLICT') {
        setConflictOpen(true)
      } else {
        setSaveError(getTranslatedApiError(err, t('saveFailed')))
      }
    } finally {
      setSaving(false)
    }
  }, [content, currentBytes, fileId, isDirty, isOversize, loading, saving, t, updatedAt])

  useEffect(() => {
    if (!isDirty || loading || saving || isOversize || conflictOpen) return
    const timer = window.setTimeout(() => {
      void handleSave()
    }, AUTOSAVE_DELAY)
    return () => window.clearTimeout(timer)
  }, [conflictOpen, handleSave, isDirty, isOversize, loading, saving])

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

  const handleInsert = useCallback((mode: InsertMode) => {
    const textarea = textareaRef.current
    if (!textarea) return
    insertMarkdown(textarea, mode, setContent)
  }, [])

  const handleReloadLatest = useCallback(async () => {
    setConflictOpen(false)
    await loadDocument()
  }, [loadDocument])

  const handleBack = useCallback(() => {
    if (isDirty) {
      setLeavingOpen(true)
      return
    }
    navigate('/dashboard/hub')
  }, [isDirty, navigate])

  const statusLabel = loading
    ? t('statusLoading')
    : saving
      ? t('statusSaving')
      : saveError
        ? saveError
        : isOversize
          ? t('oversizeInline', { size: '1 MB' })
          : isDirty
            ? t('statusUnsaved')
            : t('statusSaved', { date: formatTime(updatedAt, i18n.language) })

  return (
    <>
      <SEOHead title={meta ? `${meta.file_name} - ${t('seoTitle')}` : t('seoTitle')} noindex />

      <div className="min-h-svh bg-[radial-gradient(circle_at_top_left,_rgba(193,255,114,0.18),_transparent_30%),linear-gradient(180deg,_#f8faf7_0%,_#eef2ea_100%)] text-foreground">
        <div className="mx-auto flex min-h-svh max-w-[1600px] flex-col px-3 py-3 sm:px-4 lg:px-6 lg:py-5">
          <header className="mb-3 rounded-[28px] border border-white/70 bg-white/75 px-4 py-3 shadow-[0_20px_70px_-45px_rgba(15,23,42,0.45)] backdrop-blur xl:px-5 print:hidden">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={handleBack}
                  className="inline-flex h-10 shrink-0 items-center rounded-full border border-border/70 bg-background/70 px-3 text-sm font-medium text-muted-foreground transition hover:text-foreground"
                >
                  <Undo2 className="mr-2 h-4 w-4" />
                  {t('backToHub')}
                </button>
                <div className="min-w-0">
                  <Input
                    value={fileNameDraft}
                    onChange={(event) => setFileNameDraft(event.target.value)}
                    onBlur={() => { void handleRenameCommit() }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        void handleRenameCommit()
                      }
                    }}
                    className="h-11 min-w-[16rem] max-w-xl rounded-2xl border-transparent bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
                    disabled={!meta || renamePending}
                    aria-label={t('fileName')}
                  />
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{t('byteUsage', { used: currentBytes.toLocaleString(), max: MAX_BYTES.toLocaleString() })}</span>
                    {meta ? <span>{t('metaExpires', { date: formatTime(meta.expires_at, i18n.language) })}</span> : null}
                    <span>{statusLabel}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setShowPreview((prev) => !prev)}>
                  {showPreview ? <PanelRightClose className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                  {showPreview ? t('hidePreview') : t('showPreview')}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => window.print()}>
                  <Printer className="h-4 w-4" />
                  {t('print')}
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => { void loadDocument() }}>
                  <RefreshCw className="h-4 w-4" />
                  {t('reload')}
                </Button>
                <Button type="button" size="sm" disabled={!isDirty || isOversize || saving || loading} onClick={() => { void handleSave() }}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {t('saveNow')}
                </Button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {[
                { label: t('toolbar.h1'), prefix: '# ', placeholder: t('toolbar.headingPlaceholder') },
                { label: t('toolbar.h2'), prefix: '## ', placeholder: t('toolbar.headingPlaceholder') },
                { label: t('toolbar.bold'), prefix: '**', suffix: '**', placeholder: t('toolbar.boldPlaceholder') },
                { label: t('toolbar.italic'), prefix: '_', suffix: '_', placeholder: t('toolbar.italicPlaceholder') },
                { label: t('toolbar.quote'), prefix: '> ', placeholder: t('toolbar.quotePlaceholder') },
                { label: t('toolbar.list'), prefix: '- ', placeholder: t('toolbar.listPlaceholder') },
                { label: t('toolbar.link'), prefix: '[', suffix: '](https://)', placeholder: t('toolbar.linkPlaceholder') },
                { label: t('toolbar.code'), prefix: '```\n', suffix: '\n```', placeholder: t('toolbar.codePlaceholder') },
              ].map((item) => (
                <Button
                  key={item.label}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-full bg-background/80"
                  onClick={() => handleInsert(item)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </header>

          {loading ? (
            <div className="flex flex-1 items-center justify-center rounded-[32px] border border-dashed border-border/70 bg-white/60 print:hidden">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('statusLoading')}
              </div>
            </div>
          ) : error ? (
            <div className="flex flex-1 items-center justify-center print:hidden">
              <Card className="w-full max-w-lg rounded-[28px] border-destructive/30 bg-white/85">
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
            <>
              <div className={cn('grid min-h-0 flex-1 gap-3', showPreview ? 'lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]' : 'grid-cols-1')}>
                <section className="flex min-h-[45vh] flex-col overflow-hidden rounded-[30px] border border-zinc-900/10 bg-zinc-950 text-zinc-100 shadow-[0_30px_80px_-55px_rgba(15,23,42,0.65)] print:hidden">
                  <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-[0.24em] text-zinc-400">{t('sourceTitle')}</p>
                    <p className="text-xs text-zinc-500">{meta?.file_name}</p>
                  </div>
                  <Textarea
                    ref={textareaRef}
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    spellCheck={false}
                    className="min-h-0 flex-1 resize-none border-0 bg-transparent px-4 py-4 font-['Source_Code_Pro'] text-sm leading-7 text-zinc-100 shadow-none focus-visible:ring-0"
                    placeholder={buildDefaultContent(fileNameDraft || 'Untitled')}
                  />
                </section>

                {showPreview ? (
                  <section className="min-h-[45vh] overflow-hidden rounded-[30px] border border-white/80 bg-white/90 shadow-[0_30px_80px_-55px_rgba(15,23,42,0.45)]">
                    <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                      <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">{t('previewTitle')}</p>
                      <p className="text-xs text-muted-foreground">{t('previewHint')}</p>
                    </div>
                    <div className="h-full overflow-auto px-5 py-5 sm:px-7">
                      <MarkdownPreview content={content} />
                    </div>
                  </section>
                ) : null}
              </div>

              <div className="hidden print:block">
                <div className="mx-auto max-w-3xl bg-white px-8 py-10 text-black">
                  <h1 className="mb-8 text-2xl font-semibold">{meta?.file_name}</h1>
                  <MarkdownPreview content={content} className="text-black [&_a]:text-black [&_blockquote]:text-zinc-700 [&_code]:bg-zinc-100 [&_pre]:border-zinc-200 [&_pre]:bg-zinc-950 [&_table]:border-zinc-300 [&_td]:border-zinc-300 [&_th]:border-zinc-300 [&_th]:bg-zinc-100" />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={conflictOpen}
        onOpenChange={setConflictOpen}
        title={t('conflictTitle')}
        description={t('conflictDescription')}
        confirmLabel={t('reloadLatest')}
        cancelLabel={t('keepEditing')}
        onConfirm={() => { void handleReloadLatest() }}
      />

      <ConfirmDialog
        open={leavingOpen}
        onOpenChange={setLeavingOpen}
        title={t('leaveTitle')}
        description={t('leaveDescription')}
        confirmLabel={t('leaveAnyway')}
        cancelLabel={t('stayHere')}
        onConfirm={() => navigate('/dashboard/hub')}
      />
    </>
  )
}
