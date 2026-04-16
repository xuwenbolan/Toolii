import { useTranslation } from 'react-i18next'
import { ArrowLeft, FileOutput, FileText, Layers, MoreHorizontal, Scissors, Minimize2, PanelRightClose, PanelRightOpen, Plus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { useFileUpload } from '@/hooks/useFileUpload'
import { useToolRunState } from '@/hooks/useToolRunState'
import { useDocxWorkspace } from '@/hooks/useDocxWorkspace'
import { convertDocx, repairDocx, mergeDocx, splitDocx, compressDocx } from '@/services/docxApi'
import type { FileResult } from '@/services/docxApi'
import { api } from '@/services/api'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { ToolWorkspaceDropzone } from '@/components/tools/ToolWorkspaceDropzone'
import { ToolActionBar } from '@/components/tools/ToolActionBar'
import { ToolResultPanel } from '@/components/tools/ToolResultPanel'
import { ToolErrorBanner } from '@/components/tools/ToolErrorBanner'
import { DownloadButton } from '@/components/tools/DownloadButton'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { DocxPreviewPanel } from './DocxPreviewPanel'
import { DocxInspectPanel } from './DocxInspectPanel'
import { DocxFileList } from './DocxFileList'
import { DocxSplitDialog } from './DocxSplitDialog'
import { MergePreviewPanel } from './MergePreviewPanel'

const DOCX_ACCEPT = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
}

export function WordToolsPage() {
  const { t } = useTranslation(['tools', 'common'])

  const workspace = useDocxWorkspace()
  const { entries, activeEntry, activeId, isMergeMode, hasAnySelectedIssues } = workspace

  const [inspectorOpen, setInspectorOpen] = useState(true)
  // In merge mode, show merge overview by default; clicking a file drills into preview
  const [mergeOverviewActive, setMergeOverviewActive] = useState(true)

  // Reset merge overview when leaving merge mode, activate when entering
  useEffect(() => {
    setMergeOverviewActive(isMergeMode)
  }, [isMergeMode])

  // Repair result (DOCX)
  const [repairResult, setRepairResult] = useState<FileResult | null>(null)
  // Convert/merge result (PDF or DOCX)
  const [result, setResult] = useState<FileResult | null>(null)
  const [resultPanelOpen, setResultPanelOpen] = useState(false)

  // Converting after repair
  const [converting, setConverting] = useState(false)
  const [convertError, setConvertError] = useState<string | null>(null)

  // Replace file picker ref
  const replaceInputRef = useRef<HTMLInputElement>(null)
  // Add file picker ref (for workspace toolbar)
  const addInputRef = useRef<HTMLInputElement>(null)

  const { pending, progress, error, errorMeta, reset, run } = useFileUpload()

  const hasInput = entries.length > 0
  const activeSelectedIssues = activeEntry?.selectedIssues ?? new Set<string>()
  const hasSelectedIssues = isMergeMode ? hasAnySelectedIssues : activeSelectedIssues.size > 0

  const runState = useToolRunState({
    mode: 'manual',
    hasInput,
    hasResult: Boolean(result || repairResult),
    pending: pending || converting,
    error: error || convertError,
    texts: {
      empty: '',
      input: '',
      processing: isMergeMode
        ? t('tools:docx.workspace.merging')
        : hasSelectedIssues
          ? t('tools:docx.workspace.repairing')
          : t('tools:docx.workspace.converting'),
      result: '',
      error: error || convertError || '',
    },
  })

  const handleFiles = (files: File[]) => {
    reset()
    setResult(null)
    setRepairResult(null)
    setResultPanelOpen(false)
    setConvertError(null)
    workspace.addFiles(files)
  }

  const handleReplaceInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      workspace.clearWorkspace()
      reset()
      setResult(null)
      setRepairResult(null)
      setResultPanelOpen(false)
      setConvertError(null)
      workspace.addFiles(Array.from(files))
    }
    e.target.value = ''
  }

  const handleAddInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFiles(Array.from(files))
    }
    e.target.value = ''
  }

  // --- Single-file: Repair (returns DOCX) → refresh preview with repaired file ---
  const handleRepair = async () => {
    if (!activeEntry || activeSelectedIssues.size === 0) return
    setConvertError(null)
    const res = await run(() => repairDocx(activeEntry.file, [...activeSelectedIssues]))
    if (res) {
      const fileResult = res as FileResult
      setRepairResult(fileResult)
      setResult(null)
      setResultPanelOpen(true)

      // Fetch the repaired file and replace in workspace to refresh preview + re-analyze
      try {
        const blob = await api.get(fileResult.download_url, { responseType: 'blob' }).then((r) => r.data as Blob)
        const repairedFile = new File([blob], fileResult.filename, {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        })
        workspace.replaceFile(activeEntry.id, repairedFile)
      } catch {
        // Non-critical: preview stays on original file if download fails
      }
    }
  }

  // --- Single-file: Convert to PDF (no repair) ---
  const handleConvert = async () => {
    if (!activeEntry) return
    setConvertError(null)
    const res = await run(() => convertDocx(activeEntry.file))
    if (res) {
      setResult(res as FileResult)
      setRepairResult(null)
      setResultPanelOpen(true)
    }
  }

  // --- After repair: additionally convert to PDF ---
  const handleConvertAfterRepair = async () => {
    if (!activeEntry) return
    setConverting(true)
    setConvertError(null)
    try {
      const codes = [...activeSelectedIssues]
      const res = await convertDocx(activeEntry.file, undefined, codes)
      setResult(res)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setConvertError(message)
    } finally {
      setConverting(false)
    }
  }

  // --- Split dialog state ---
  const [splitDialogOpen, setSplitDialogOpen] = useState(false)

  const handleSplit = async (level: number) => {
    if (!activeEntry) return
    setSplitDialogOpen(false)
    setConvertError(null)
    const res = await run(() => splitDocx(activeEntry.file, level))
    if (res) {
      setResult(res as FileResult)
      setRepairResult(null)
      setResultPanelOpen(true)
    }
  }

  const handleCompress = async () => {
    if (!activeEntry) return
    setConvertError(null)
    const res = await run(() => compressDocx(activeEntry.file))
    if (res) {
      setResult(res as FileResult)
      setRepairResult(null)
      setResultPanelOpen(true)
    }
  }

  // --- Merge actions ---
  const handleMerge = async (outputFormat: 'docx' | 'pdf') => {
    if (entries.length < 2) return
    setConvertError(null)
    const files = entries.map((e) => e.file)
    const issues = workspace.getMergeIssuesMap()
    const res = await run(() => mergeDocx(files, { outputFormat, issues }))
    if (res) {
      setResult(res as FileResult)
      setRepairResult(null)
      setResultPanelOpen(true)
    }
  }

  const handleToggleIssue = (code: string) => {
    if (activeEntry) workspace.toggleIssue(activeEntry.id, code)
  }

  const handleToggleAll = () => {
    if (activeEntry) workspace.toggleAllIssues(activeEntry.id)
  }

  const handleClear = () => {
    workspace.clearWorkspace()
    setResult(null)
    setRepairResult(null)
    setResultPanelOpen(false)
    setConvertError(null)
    reset()
  }

  // --- Action bar: depends on mode ---
  const getActionBarProps = () => {
    if (isMergeMode) {
      return {
        ctaLabel: hasSelectedIssues
          ? t('tools:docx.workspace.fixAndMergePdf')
          : t('tools:docx.workspace.mergePdf'),
        onCta: () => handleMerge('pdf'),
        secondaryCtaLabel: hasSelectedIssues
          ? t('tools:docx.workspace.fixAndMergeDocx')
          : t('tools:docx.workspace.mergeDocx'),
        onSecondaryCta: () => handleMerge('docx'),
      }
    }
    if (hasSelectedIssues) {
      return {
        ctaLabel: t('tools:docx.workspace.repair'),
        onCta: handleRepair,
        secondaryCtaLabel: t('tools:docx.workspace.convertPdf'),
        onSecondaryCta: handleConvert,
      }
    }
    return {
      ctaLabel: t('tools:docx.workspace.convertPdf'),
      onCta: handleConvert,
      secondaryCtaLabel: undefined as string | undefined,
      onSecondaryCta: undefined as (() => void) | undefined,
    }
  }

  const actionBar = getActionBarProps()
  const anyResult = repairResult || result

  // File info metadata
  const meta = activeEntry?.analysis?.metadata
  const sizeMb = activeEntry ? (activeEntry.file.size / 1024 / 1024).toFixed(1) : '0'

  // ─── Empty state: standard tool page with dropzone ───
  if (!hasInput) {
    return (
      <>
        <ToolPageShell
          title={t('tools:docx.title')}
          description={t('tools:docx.description')}
          toolName="docx/tools"
          layout="compact"
        >
          <ToolWorkspaceDropzone
            accept={DOCX_ACCEPT}
            multiple
            title={t('tools:docx.workspace.dropTitle')}
            hint={t('tools:docx.workspace.dropHint')}
            onFiles={handleFiles}
          />
        </ToolPageShell>
      </>
    )
  }

  // ─── Workspace state: full-page document workbench ───
  return (
    <>
      <div className="fixed inset-0 z-40 flex flex-col bg-background motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
        {/* ── Top toolbar ── */}
        <header className="flex h-11 items-center gap-2 border-b bg-card/80 backdrop-blur-sm px-3 shrink-0">
          {/* Left: Back + tool name */}
          <Button asChild variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <span className="text-sm font-medium text-muted-foreground shrink-0">
            {t('tools:docx.title')}
          </span>
          <div className="h-4 w-px bg-border mx-1 shrink-0" />

          {/* Center: File info / Merge info */}
          {isMergeMode && mergeOverviewActive ? (
            <div className="flex items-center gap-2 text-sm min-w-0">
              <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="font-medium">
                {t('tools:docx.workspace.mergePreview')}
              </span>
              <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
                {t('tools:docx.workspace.fileCount', { count: entries.length })}
              </span>
            </div>
          ) : activeEntry ? (
            <div className="flex items-center gap-2 text-sm min-w-0">
              {isMergeMode && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-xs text-muted-foreground shrink-0"
                  onClick={() => setMergeOverviewActive(true)}
                >
                  <Layers className="h-3 w-3 mr-1" />
                  {t('tools:docx.workspace.mergePreview')}
                </Button>
              )}
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="font-medium truncate max-w-[200px]">{activeEntry.file.name}</span>
              {meta && (
                <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline tabular-nums">
                  {meta.page_count_estimate}p
                  <span className="mx-1 opacity-40">&middot;</span>
                  {meta.word_count.toLocaleString()} {t('tools:docx.metadata.wordCount').toLowerCase()}
                  <span className="mx-1 opacity-40">&middot;</span>
                  {sizeMb} MB
                </span>
              )}
            </div>
          ) : null}

          <div className="flex-1" />

          {/* Right: Actions */}
          {!isMergeMode && activeEntry && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{t('tools:docx.workspace.moreActions')}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setSplitDialogOpen(true)} disabled={pending || converting}>
                    <Scissors className="h-4 w-4 mr-2" />
                    {t('tools:docx.workspace.splitByHeading')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleCompress} disabled={pending || converting}>
                    <Minimize2 className="h-4 w-4 mr-2" />
                    {t('tools:docx.workspace.compressDocx')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => replaceInputRef.current?.click()} disabled={pending || converting}>
                    <FileText className="h-4 w-4 mr-2" />
                    {t('common:actions.replace')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <input
                ref={replaceInputRef}
                type="file"
                accept=".docx"
                className="hidden"
                onChange={handleReplaceInput}
              />
            </>
          )}

          <div className="h-4 w-px bg-border mx-0.5 shrink-0" />

          {/* Inspector toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 shrink-0"
            onClick={() => setInspectorOpen((v) => !v)}
            aria-label={t('tools:docx.workspace.toggleInspector')}
          >
            {inspectorOpen ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRightOpen className="h-4 w-4" />
            )}
          </Button>
        </header>

        {/* ── Three-column content ── */}
        <div className="flex flex-1 min-h-0">
          {/* Left: File sidebar */}
          <aside className="w-[200px] border-r bg-card/50 flex flex-col shrink-0 motion-safe:animate-in motion-safe:slide-in-from-left-2 motion-safe:duration-300">
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <h3 className="text-xs font-medium text-muted-foreground">
                {t('tools:docx.workspace.fileCount', { count: entries.length })}
              </h3>
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => addInputRef.current?.click()}
                  aria-label={t('tools:docx.workspace.addMoreFiles')}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                  onClick={handleClear}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
              <input
                ref={addInputRef}
                type="file"
                accept=".docx"
                multiple
                className="hidden"
                onChange={handleAddInput}
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <DocxFileList
                entries={entries}
                activeId={activeId}
                isMergeMode={isMergeMode}
                onSelect={(id) => { workspace.setActiveId(id); setMergeOverviewActive(false) }}
                onRemove={workspace.removeFile}
                onReorder={workspace.reorderFiles}
                onAddFiles={handleFiles}
              />
            </div>
          </aside>

          {/* Center: Document canvas / Merge overview */}
          <main className="flex-1 min-w-0 flex flex-col relative">
            {isMergeMode && mergeOverviewActive ? (
              <div className="flex-1 overflow-auto p-6">
                <MergePreviewPanel
                  entries={entries}
                  onSelectFile={(id) => {
                    workspace.setActiveId(id)
                    setMergeOverviewActive(false)
                  }}
                />
              </div>
            ) : (
              <DocxPreviewPanel file={activeEntry?.file ?? null} />
            )}
            <ToolErrorBanner error={error || convertError} errorMeta={errorMeta} />
          </main>

          {/* Right: Inspector panel (smooth collapsible) */}
          <aside
            className={cn(
              'border-l bg-card/50 flex flex-col shrink-0 overflow-hidden transition-[width] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)]',
              inspectorOpen && activeEntry ? 'w-[300px] xl:w-[320px]' : 'w-0 border-l-0',
            )}
          >
            {activeEntry && (
              <div className="w-[300px] xl:w-[320px] flex flex-col h-full">
                <DocxInspectPanel
                  analysis={activeEntry.analysis}
                  loading={activeEntry.analysisLoading}
                  error={activeEntry.analysisError}
                  selectedIssues={activeEntry.selectedIssues}
                  onToggleIssue={handleToggleIssue}
                  onToggleAll={handleToggleAll}
                />
              </div>
            )}
          </aside>
        </div>
      </div>

      {/* Action bar (fixed bottom, above the workspace overlay) */}
      <ToolActionBar
        mode="manual"
        status={runState.statusText}
        pending={pending || converting}
        progress={progress}
        error={error || convertError}
        done={runState.phase === 'done'}
        ctaLabel={actionBar.ctaLabel}
        ctaDisabled={!hasInput || pending || converting}
        onCta={actionBar.onCta}
        secondaryCtaLabel={actionBar.secondaryCtaLabel}
        secondaryCtaDisabled={!hasInput || pending || converting}
        onSecondaryCta={actionBar.onSecondaryCta}
        onViewResult={anyResult ? () => setResultPanelOpen(true) : undefined}
        toolName="docx/tools"
        className="z-50"
      />

      {/* Split dialog */}
      <DocxSplitDialog
        open={splitDialogOpen}
        onClose={() => setSplitDialogOpen(false)}
        onConfirm={handleSplit}
        analysis={activeEntry?.analysis ?? null}
        pending={pending}
      />

      <ToolResultPanel
        open={resultPanelOpen}
        title={t('common:actions.downloadResult')}
        onClose={() => setResultPanelOpen(false)}
      >
        <div className="space-y-3">
          {repairResult && (
            <div className="rounded-lg border border-border bg-card p-3 space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-md bg-info/10 flex items-center justify-center shrink-0">
                  <FileText className="h-4.5 w-4.5 text-info" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{repairResult.filename}</div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {repairResult.size >= 1024 * 1024
                      ? `${(repairResult.size / 1024 / 1024).toFixed(1)} MB`
                      : `${(repairResult.size / 1024).toFixed(0)} KB`}
                  </div>
                </div>
              </div>
              <DownloadButton url={repairResult.download_url} />
            </div>
          )}

          {repairResult && !result && (
            <Button
              className="w-full"
              variant="outline"
              disabled={converting}
              onClick={handleConvertAfterRepair}
            >
              <FileOutput className="h-4 w-4 mr-1.5" />
              {converting
                ? t('tools:docx.workspace.converting')
                : t('tools:docx.workspace.convertPdf')}
            </Button>
          )}

          {result && (
            <div className="rounded-lg border border-border bg-card p-3 space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className={cn(
                  'h-9 w-9 rounded-md flex items-center justify-center shrink-0',
                  result.filename.endsWith('.pdf') ? 'bg-destructive/10' : 'bg-info/10',
                )}>
                  <FileText className={cn(
                    'h-4.5 w-4.5',
                    result.filename.endsWith('.pdf') ? 'text-destructive' : 'text-info',
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{result.filename}</div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {result.size >= 1024 * 1024
                      ? `${(result.size / 1024 / 1024).toFixed(1)} MB`
                      : `${(result.size / 1024).toFixed(0)} KB`}
                  </div>
                </div>
              </div>
              <DownloadButton url={result.download_url} />
            </div>
          )}
        </div>
      </ToolResultPanel>
    </>
  )
}
