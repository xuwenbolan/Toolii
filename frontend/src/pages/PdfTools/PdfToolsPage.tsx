import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  CheckSquare,
  RotateCw,
  Scissors,
  Square,
  Trash2,
  XCircle,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { PdfPageLightbox } from '@/components/pdf/PdfPageLightbox'
import { PdfWorkspaceEmpty } from '@/components/pdf/PdfWorkspaceEmpty'
import { PdfWorkspaceGrid } from '@/components/pdf/PdfWorkspaceGrid'
import { SEOHead } from '@/components/common/SEOHead'
import { ToolActionBar } from '@/components/tools/ToolActionBar'
import { ToolErrorBanner } from '@/components/tools/ToolErrorBanner'
import { ToolResultPanel } from '@/components/tools/ToolResultPanel'
import { Button } from '@/components/ui/button'
import { useFileDownload } from '@/hooks/useFileDownload'
import { useFileUpload } from '@/hooks/useFileUpload'
import { useMultiPdfThumbnails } from '@/hooks/useMultiPdfThumbnails'
import { usePdfWorkspace } from '@/hooks/usePdfWorkspace'
import { useToolRunState } from '@/hooks/useToolRunState'
import { formatBytes } from '@/lib/fileValidation'
import {
  compressPdf,
  editPdfPages,
  imagesToPdf,
  mergePdfs,
  type FileResult,
} from '@/services/pdfApi'

async function downloadResultAsFile(result: FileResult): Promise<File> {
  const response = await fetch(result.download_url, { credentials: 'include' })
  if (!response.ok) throw new Error('Failed to download intermediate result')
  const blob = await response.blob()
  return new File([blob], result.filename, { type: 'application/pdf' })
}

export function PdfToolsPage() {
  const { t } = useTranslation(['tools', 'common'])
  const download = useFileDownload()
  const workspace = usePdfWorkspace()
  const { thumbnails, pageCounts, loading: thumbsLoading } = useMultiPdfThumbnails(
    workspace.sourceFiles,
    { maxPagesPerFile: 100, thumbnailWidth: 184 },
  )
  const { pending, progress, error, errorMeta, reset, run, retry } = useFileUpload()
  const [exportStep, setExportStep] = useState<string | null>(null)
  const [resultPanelOpen, setResultPanelOpen] = useState(false)
  const [resultSummary, setResultSummary] = useState<string | null>(null)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)

  // Sync page counts from thumbnail rendering into workspace
  useEffect(() => {
    workspace.syncPageCounts(pageCounts, workspace.sourceFiles.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageCounts, workspace.sourceFiles.length])

  const hasPages = workspace.pages.length > 0
  const selectionCount = workspace.selectedIds.size
  const totalSize = workspace.sourceFiles.reduce((sum, f) => sum + f.size, 0)
  const readyInfo = hasPages
    ? `${workspace.pages.length} ${t('pdf.workspace.pageCount')} · ${workspace.sourceFiles.length} ${t('pdf.workspace.fileCount')} · ${formatBytes(totalSize)}`
    : undefined
  const runState = useToolRunState({
    mode: 'manual',
    hasInput: hasPages,
    hasResult: Boolean(resultSummary),
    pending,
    error,
    texts: {
      empty: t('pdf.workspace.emptyTitle'),
      input: readyInfo,
      processing: exportStep ?? t('common:actions.processingWait'),
      result: resultSummary ?? readyInfo,
    },
  })

  const handleAddFiles = useCallback(
    async (files: File[]) => {
      const pdfs = files.filter((f) => f.type === 'application/pdf')
      const images = files.filter((f) => f.type.startsWith('image/'))

      if (pdfs.length > 0) {
        workspace.addFiles(pdfs)
      }

      if (images.length > 0) {
        try {
          const result = await run((onProgress) => imagesToPdf(images, {}, onProgress))
          const pdfFile = await downloadResultAsFile(result)
          workspace.addFiles([pdfFile])
        } catch {
          // Error handled by useFileUpload
        }
      }
    },
    [workspace, run],
  )

  const handleExport = useCallback(
    async (compress = false) => {
      if (workspace.pages.length === 0) return
      reset()
      setResultSummary(null)
      setResultPanelOpen(false)

      try {
        let currentFile: File
        let lastResult: FileResult | null = null

        // Step 1: Merge if multiple source files
        if (workspace.sourceFiles.length > 1) {
          setExportStep(t('pdf.workspace.exportStepMerge'))
          lastResult = await run((onProgress) => mergePdfs(workspace.sourceFiles, onProgress))
          currentFile = await downloadResultAsFile(lastResult)
        } else {
          currentFile = workspace.sourceFiles[0]
        }

        // Step 2: Reorder + delete (combined as reorder with desired page list)
        const desiredOrder = workspace.pages.map((p) => p.globalPageNumber)
        const totalOriginal = workspace.totalOriginalPages
        const isDefaultOrder =
          desiredOrder.length === totalOriginal && desiredOrder.every((n, i) => n === i + 1)

        if (!isDefaultOrder) {
          setExportStep(t('pdf.workspace.exportStepPages'))
          lastResult = await run((onProgress) =>
            editPdfPages(currentFile, { operation: 'reorder', order: desiredOrder }, onProgress),
          )
          currentFile = await downloadResultAsFile(lastResult)
        }

        // Step 3: Rotate pages (grouped by angle)
        const rotationGroups = new Map<number, number[]>()
        workspace.pages.forEach((page, newIndex) => {
          const normalized = ((page.rotation % 360) + 360) % 360
          if (normalized !== 0) {
            const group = rotationGroups.get(normalized) ?? []
            group.push(newIndex + 1)
            rotationGroups.set(normalized, group)
          }
        })

        for (const [rotation, pageNumbers] of rotationGroups) {
          setExportStep(t('pdf.workspace.exportStepRotate'))
          lastResult = await run((onProgress) =>
            editPdfPages(
              currentFile,
              { operation: 'rotate', pages: pageNumbers, rotation },
              onProgress,
            ),
          )
          currentFile = await downloadResultAsFile(lastResult)
        }

        // Step 4: Compress if requested
        if (compress) {
          setExportStep(t('pdf.workspace.exportStepCompress'))
          lastResult = await run((onProgress) => compressPdf(currentFile, {}, onProgress))
        }

        // Step 5: Download
        if (lastResult) {
          download(lastResult.download_url)
        } else {
          // No server processing happened — download client-side file directly
          const url = URL.createObjectURL(currentFile)
          const a = document.createElement('a')
          a.href = url
          a.download = currentFile.name
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          setTimeout(() => URL.revokeObjectURL(url), 1000)
        }

        setResultSummary(
          `${compress ? t('pdf.workspace.compressExport') : t('pdf.workspace.export')} · ${workspace.pages.length} ${t('pdf.workspace.pageCount')}`,
        )
        setResultPanelOpen(true)
        setExportStep(null)
      } catch {
        setResultSummary(null)
        setExportStep(null)
      }
    },
    [workspace, run, reset, download, t],
  )

  const handleExtractSelected = useCallback(async () => {
    if (workspace.selectedIds.size === 0 || workspace.sourceFiles.length === 0) return
    reset()
    setResultSummary(null)
    setResultPanelOpen(false)

    try {
      let currentFile: File

      if (workspace.sourceFiles.length > 1) {
        setExportStep(t('pdf.workspace.exportStepMerge'))
        const mergeResult = await run((onProgress) =>
          mergePdfs(workspace.sourceFiles, onProgress),
        )
        currentFile = await downloadResultAsFile(mergeResult)
      } else {
        currentFile = workspace.sourceFiles[0]
      }

      const selectedGlobalPages = workspace.pages
        .filter((p) => workspace.selectedIds.has(p.id))
        .map((p) => p.globalPageNumber)

      setExportStep(t('pdf.workspace.exportStepExtract'))
      const result = await run((onProgress) =>
        editPdfPages(
          currentFile,
          { operation: 'extract', pages: selectedGlobalPages },
          onProgress,
        ),
      )
      download(result.download_url)
      setResultSummary(`${t('pdf.workspace.extract')} · ${selectedGlobalPages.length} ${t('pdf.workspace.pageCount')}`)
      setResultPanelOpen(true)
      setExportStep(null)
    } catch {
      setResultSummary(null)
      setExportStep(null)
    }
  }, [workspace, run, reset, download, t])

  return (
    <>
      <SEOHead
        title={t('pdf.seoTitle')}
        description={t('pdf.seoDescription')}
        keywords={t('pdf.seoKeywords')}
        canonicalPath="/pdf-tools"
      />

      <div className="mx-auto w-full max-w-[96rem] space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm" className="h-8 w-fit px-2.5">
              <Link to="/" className="inline-flex items-center gap-1.5">
                <ArrowLeft className="h-4 w-4" />
                <span>{t('common:actions.back')}</span>
              </Link>
            </Button>
            <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
              {t('pdf.workspace.title')}
            </h1>
          </div>
        </div>

        {/* Workspace */}
        {!hasPages && !thumbsLoading ? (
          <PdfWorkspaceEmpty onFiles={(f) => void handleAddFiles(f)} />
        ) : (
          <PdfWorkspaceGrid
            pages={workspace.pages}
            thumbnails={thumbnails}
            selectedIds={workspace.selectedIds}
            loading={thumbsLoading}
            onReorder={workspace.reorderPages}
            onToggleSelect={workspace.toggleSelect}
            onRotatePage={(id) => workspace.rotatePage(id, 90)}
            onDeletePage={workspace.deletePage}
            onAddFiles={(f) => void handleAddFiles(f)}
            onPreviewPage={setPreviewIndex}
          />
        )}

        {/* Status bar */}
        {hasPages && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
            <span>
              {workspace.pages.length} {t('pdf.workspace.pageCount')}
            </span>
            <span>
              {workspace.sourceFiles.length} {t('pdf.workspace.fileCount')} · {formatBytes(totalSize)}
            </span>
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={workspace.clearWorkspace}
            >
              {t('pdf.workspace.clearAll')}
            </button>
          </div>
        )}

        <ToolErrorBanner
          error={error}
          errorMeta={errorMeta}
          onRetry={hasPages ? () => retry() : undefined}
        />
      </div>

      <ToolActionBar
        mode="manual"
        status={runState.statusText}
        pending={pending}
        progress={progress}
        error={error}
        done={runState.phase === 'done'}
        secondaryCtaLabel={t('pdf.workspace.compressExport')}
        secondaryCtaDisabled={!hasPages}
        onSecondaryCta={() => {
          void handleExport(true)
        }}
        ctaLabel={t('pdf.workspace.export')}
        ctaDisabled={!hasPages}
        onCta={() => {
          void handleExport(false)
        }}
        maxWidthClassName="max-w-[96rem]"
      />

      <ToolResultPanel
        open={Boolean(resultSummary && resultPanelOpen)}
        title={t('common:actions.downloadResult')}
        onClose={() => setResultPanelOpen(false)}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{resultSummary}</p>
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => setResultPanelOpen(false)}>
              {t('common:actions.back')}
            </Button>
          </div>
        </div>
      </ToolResultPanel>

      <PdfPageLightbox
        open={previewIndex !== null}
        files={workspace.sourceFiles}
        pages={workspace.pages}
        initialIndex={previewIndex ?? 0}
        onClose={() => setPreviewIndex(null)}
      />

      {/* Floating selection action bar */}
      <div
        className={[
          'fixed inset-x-0 bottom-[4.75rem] z-40 flex justify-center transition-all duration-300',
          selectionCount > 0
            ? 'translate-y-0 opacity-100'
            : 'pointer-events-none translate-y-full opacity-0',
        ].join(' ')}
      >
        <div className="flex items-center gap-1.5 rounded-xl border border-border/50 bg-background/80 px-3 py-2 shadow-lg backdrop-blur-xl sm:gap-2 sm:px-4 sm:py-2.5">
          <span className="mr-1 text-sm font-medium tabular-nums">
            {selectionCount} {t('pdf.workspace.selected')}
          </span>

          <div className="h-4 w-px bg-border" />

          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => workspace.rotateSelected(90)}
          >
            <RotateCw className="mr-1.5 h-3.5 w-3.5" />
            {t('pdf.workspace.rotate')}
          </Button>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={pending}
            onClick={workspace.deleteSelected}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            {t('pdf.workspace.delete')}
          </Button>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => void handleExtractSelected()}
          >
            <Scissors className="mr-1.5 h-3.5 w-3.5" />
            {t('pdf.workspace.extract')}
          </Button>

          <div className="h-4 w-px bg-border" />

          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              if (selectionCount === workspace.pages.length) {
                workspace.clearSelection()
              } else {
                workspace.selectAll()
              }
            }}
          >
            {selectionCount === workspace.pages.length ? (
              <>
                <Square className="mr-1.5 h-3.5 w-3.5" />
                {t('pdf.workspace.deselectAll')}
              </>
            ) : (
              <>
                <CheckSquare className="mr-1.5 h-3.5 w-3.5" />
                {t('pdf.workspace.selectAllShort')}
              </>
            )}
          </Button>

          <button
            type="button"
            className="ml-1 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={workspace.clearSelection}
            aria-label="Close"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  )
}
