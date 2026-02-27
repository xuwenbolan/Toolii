import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'

import { SEOHead } from '@/components/common/SEOHead'
import { PdfPageWorkspace } from '@/components/pdf/PdfPageWorkspace'
import { ArtifactPreviewCard } from '@/components/tools/ArtifactPreviewCard'
import { DownloadButton } from '@/components/tools/DownloadButton'
import { ProcessingStatus } from '@/components/tools/ProcessingStatus'
import { SortableFileList } from '@/components/tools/SortableFileList'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { UploadProgress } from '@/components/upload/UploadProgress'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useFileUpload } from '@/hooks/useFileUpload'
import { formatBytes } from '@/lib/fileValidation'
import { isIntInRange, parseFiniteNumber } from '@/lib/numberInput'
import {
  compressPdf,
  editPdfPages,
  imagesToPdf,
  mergePdfs,
  splitPdf,
  type FileResult,
} from '@/services/pdfApi'

type WorkspaceOperation = 'compress' | 'merge' | 'split' | 'pages' | 'imagesToPdf'
type PageOperation = 'rotate' | 'delete' | 'extract' | 'reorder'

function resolveOperationFromPath(pathname: string): WorkspaceOperation {
  if (pathname.endsWith('/compress')) return 'compress'
  if (pathname.endsWith('/split')) return 'split'
  if (pathname.endsWith('/pages')) return 'pages'
  if (pathname.endsWith('/from-images')) return 'imagesToPdf'
  if (pathname.endsWith('/merge')) return 'merge'
  return 'merge'
}

function parsePageSpec(input: string, t: (key: string) => string): number[] {
  const raw = input.trim()
  if (!raw) return []

  const values: number[] = []
  for (const part of raw.split(',')) {
    const token = part.trim()
    if (!token) continue

    if (token.includes('-')) {
      const [startRaw, endRaw] = token.split('-', 2).map((s) => s.trim())
      const start = Number(startRaw)
      const end = Number(endRaw)
      if (!Number.isInteger(start) || !Number.isInteger(end) || start <= 0 || end <= 0) {
        throw new Error(t('pdf.pages.invalidPageRange'))
      }
      const step = start <= end ? 1 : -1
      for (let n = start; step > 0 ? n <= end : n >= end; n += step) {
        values.push(n)
      }
      continue
    }

    const page = Number(token)
    if (!Number.isInteger(page) || page <= 0) {
      throw new Error(t('pdf.pages.invalidPage'))
    }
    values.push(page)
  }

  return values
}

function formatPageList(pages: number[]) {
  return pages.join(',')
}

function getOperationPath(operation: WorkspaceOperation) {
  switch (operation) {
    case 'compress':
      return '/pdf-tools/compress'
    case 'split':
      return '/pdf-tools/split'
    case 'pages':
      return '/pdf-tools/pages'
    case 'imagesToPdf':
      return '/pdf-tools/from-images'
    case 'merge':
    default:
      return '/pdf-tools/merge'
  }
}

export function PdfToolsPage() {
  const { t } = useTranslation('tools')
  const location = useLocation()
  const navigate = useNavigate()
  const { pending, progress, error, reset, run } = useFileUpload()
  const [pdfFiles, setPdfFiles] = useState<File[]>([])
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [targetKbInput, setTargetKbInput] = useState('')
  const [ranges, setRanges] = useState('')
  const [dpiInput, setDpiInput] = useState('150')
  const [pagesOperation, setPagesOperation] = useState<PageOperation>('extract')
  const [pagesInput, setPagesInput] = useState('')
  const [orderInput, setOrderInput] = useState('')
  const [rotationInput, setRotationInput] = useState('90')
  const [result, setResult] = useState<FileResult | null>(null)
  const operation = resolveOperationFromPath(location.pathname)

  const targetKb = parseFiniteNumber(targetKbInput)
  const targetKbValid = targetKbInput.trim() === '' || (targetKb != null && isIntInRange(targetKb, 1, 1_000_000))
  const dpi = parseFiniteNumber(dpiInput)
  const dpiValid = dpi != null && isIntInRange(dpi, 72, 600)

  const parsedPagesPreview = useMemo(() => {
    try {
      return { pages: parsePageSpec(pagesInput, t), error: null as string | null }
    } catch (err) {
      return {
        pages: [] as number[],
        error: err instanceof Error ? err.message : t('pdf.pages.invalidPage'),
      }
    }
  }, [pagesInput, t])

  const parsedOrderPreview = useMemo(() => {
    try {
      if (!orderInput.trim()) return { pages: [] as number[], error: null as string | null }
      return { pages: parsePageSpec(orderInput, t), error: null as string | null }
    } catch (err) {
      return {
        pages: [] as number[],
        error: err instanceof Error ? err.message : t('pdf.pages.invalidPage'),
      }
    }
  }, [orderInput, t])

  const visualSelectedPages = useMemo(
    () => [...new Set(parsedPagesPreview.pages)].sort((a, b) => a - b),
    [parsedPagesPreview.pages],
  )
  const visualOrderPages = useMemo(
    () => [...parsedOrderPreview.pages],
    [parsedOrderPreview.pages],
  )

  const pageInputError = pagesOperation === 'reorder' ? parsedOrderPreview.error : parsedPagesPreview.error
  const rotation = parseFiniteNumber(rotationInput)
  const rotationValid =
    pagesOperation !== 'rotate' ||
    (rotation != null && isIntInRange(rotation, -3600, 3600) && rotation % 90 === 0)
  const pageRequiredInputMissing =
    pagesOperation === 'reorder'
      ? parsedOrderPreview.pages.length === 0
      : (pagesOperation === 'extract' || pagesOperation === 'delete') && parsedPagesPreview.pages.length === 0

  const singlePdfFile = pdfFiles[0] ?? null
  const isMultiMode = operation === 'merge' || operation === 'imagesToPdf'
  const activeDescription: Record<WorkspaceOperation, string> = {
    compress: t('pdf.compress.description'),
    merge: t('pdf.merge.description'),
    split: t('pdf.split.description'),
    pages: t('pdf.pages.description'),
    imagesToPdf: t('pdf.imagesToPdf.description'),
  }
  const actionLabel: Record<WorkspaceOperation, string> = {
    compress: pending ? t('pdf.compress.processing') : t('pdf.compress.startCompress'),
    merge: pending ? t('pdf.merge.processing') : t('pdf.merge.startMerge'),
    split: pending ? t('pdf.split.processing') : t('pdf.split.startSplit'),
    pages: pending ? t('pdf.pages.processing') : t('pdf.pages.startProcess'),
    imagesToPdf: pending ? t('pdf.imagesToPdf.processing') : t('pdf.imagesToPdf.startConvert'),
  }

  const inputSummary = useMemo(() => {
    if (operation === 'merge') {
      if (pdfFiles.length === 0) return null
      const total = pdfFiles.reduce((acc, file) => acc + file.size, 0)
      return t('pdf.merge.fileInfo', { count: pdfFiles.length, size: formatBytes(total) })
    }
    if (operation === 'imagesToPdf') {
      if (imageFiles.length === 0) return null
      const total = imageFiles.reduce((acc, file) => acc + file.size, 0)
      return t('pdf.imagesToPdf.fileInfo', { count: imageFiles.length, size: formatBytes(total) })
    }
    if (!singlePdfFile) return null
    return `${singlePdfFile.name} · ${formatBytes(singlePdfFile.size)}`
  }, [imageFiles, operation, pdfFiles, singlePdfFile, t])

  const canRun = (() => {
    switch (operation) {
      case 'compress':
        return Boolean(singlePdfFile) && targetKbValid
      case 'merge':
        return pdfFiles.length >= 2
      case 'split':
        return Boolean(singlePdfFile) && ranges.trim().length > 0
      case 'pages':
        return Boolean(singlePdfFile) && !pageInputError && !pageRequiredInputMissing && rotationValid
      case 'imagesToPdf':
        return imageFiles.length > 0 && dpiValid
      default:
        return false
    }
  })()

  const handleSubmit = async () => {
    if (!canRun) return
    setResult(null)
    try {
      const res = await run((onProgress) => {
        switch (operation) {
          case 'compress':
            return compressPdf(singlePdfFile as File, {
              targetKb: targetKbInput.trim() === '' ? undefined : (targetKb ?? undefined),
            }, onProgress)
          case 'merge':
            return mergePdfs(pdfFiles, onProgress)
          case 'split':
            return splitPdf(singlePdfFile as File, { ranges: ranges.trim() }, onProgress)
          case 'pages': {
            const pagesList = pagesOperation === 'reorder' ? null : parsePageSpec(pagesInput, t)
            const orderList = pagesOperation === 'reorder' ? parsePageSpec(orderInput, t) : null
            const pagesPayload =
              pagesOperation === 'rotate'
                ? pagesList && pagesList.length > 0
                  ? pagesList
                  : undefined
                : pagesList ?? undefined
            return editPdfPages(
              singlePdfFile as File,
              {
                operation: pagesOperation,
                pages: pagesPayload,
                order: orderList && orderList.length > 0 ? orderList : undefined,
                rotation: rotation ?? 90,
              },
              onProgress,
            )
          }
          case 'imagesToPdf':
            return imagesToPdf(imageFiles, { dpi: dpi ?? undefined }, onProgress)
          default:
            return Promise.reject(new Error('Unsupported operation'))
        }
      })
      setResult(res)
    } catch {
      // Error message handled by useFileUpload.
    }
  }

  const handleQuickApplyPage = async (pageNumber: number) => {
    if (operation !== 'pages') return
    if (pagesOperation === 'reorder') return
    if (!singlePdfFile || pending) return

    setPagesInput(String(pageNumber))
    setResult(null)
    try {
      const res = await run((onProgress) =>
        editPdfPages(
          singlePdfFile,
          {
            operation: pagesOperation,
            pages: [pageNumber],
            rotation: rotation ?? 90,
          },
          onProgress,
        ),
      )
      setResult(res)
    } catch {
      // Error message handled by useFileUpload.
    }
  }

  const handleQuickApplySelectedPages = async (pages: number[]) => {
    if (operation !== 'pages') return
    if (pagesOperation === 'reorder') return
    if (!singlePdfFile || pending || pages.length === 0) return

    const uniquePages = [...new Set(pages)].sort((a, b) => a - b)
    setPagesInput(formatPageList(uniquePages))
    setResult(null)
    try {
      const res = await run((onProgress) =>
        editPdfPages(
          singlePdfFile,
          {
            operation: pagesOperation,
            pages: uniquePages,
            rotation: rotation ?? 90,
          },
          onProgress,
        ),
      )
      setResult(res)
    } catch {
      // Error message handled by useFileUpload.
    }
  }

  return (
    <>
      <SEOHead
        title={t('pdf.seoTitle')}
        description={t('pdf.seoDescription')}
        keywords={t('pdf.seoKeywords')}
        canonicalPath="/pdf-tools"
      />
      <ToolPageShell
        title={t('pdf.title')}
        description={t('pdf.subtitle')}
        width="full"
        layout="workspace"
        sidebar={
          <div className="space-y-4">
            <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
              <div className="space-y-3">
                <p className="text-sm font-medium">{t('pdf.workspace.processingPanel')}</p>
                {inputSummary ? <p className="text-xs text-muted-foreground">{inputSummary}</p> : null}
                {!isMultiMode && singlePdfFile ? (
                  <ArtifactPreviewCard
                    label={t('common:preview.input')}
                    filename={singlePdfFile.name}
                    sizeText={formatBytes(singlePdfFile.size)}
                    mediaKind="pdf"
                  />
                ) : null}
                <ProcessingStatus pending={pending} error={error} />
                <UploadProgress value={pending ? progress : null} />
                <Button type="button" className="w-full" disabled={!canRun || pending} onClick={handleSubmit}>
                  {actionLabel[operation]}
                </Button>
              </div>
            </div>

            {result ? (
              <ArtifactPreviewCard
                label={t('common:preview.output')}
                filename={result.filename}
                sizeText={formatBytes(result.size)}
                mediaKind="pdf"
                action={<DownloadButton url={result.download_url} className="w-auto" />}
              />
            ) : null}
          </div>
        }
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <Label>{t('pdf.workspace.operationLabel')}</Label>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              <Button
                type="button"
                variant={operation === 'merge' ? 'secondary' : 'outline'}
                onClick={() => {
                  navigate(getOperationPath('merge'))
                  reset()
                  setResult(null)
                }}
              >
                {t('pdf.merge.title')}
              </Button>
              <Button
                type="button"
                variant={operation === 'split' ? 'secondary' : 'outline'}
                onClick={() => {
                  navigate(getOperationPath('split'))
                  reset()
                  setResult(null)
                }}
              >
                {t('pdf.split.title')}
              </Button>
              <Button
                type="button"
                variant={operation === 'compress' ? 'secondary' : 'outline'}
                onClick={() => {
                  navigate(getOperationPath('compress'))
                  reset()
                  setResult(null)
                }}
              >
                {t('pdf.compress.title')}
              </Button>
              <Button
                type="button"
                variant={operation === 'pages' ? 'secondary' : 'outline'}
                onClick={() => {
                  navigate(getOperationPath('pages'))
                  reset()
                  setResult(null)
                }}
              >
                {t('pdf.pages.title')}
              </Button>
              <Button
                type="button"
                variant={operation === 'imagesToPdf' ? 'secondary' : 'outline'}
                onClick={() => {
                  navigate(getOperationPath('imagesToPdf'))
                  reset()
                  setResult(null)
                }}
              >
                {t('pdf.imagesToPdf.title')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{activeDescription[operation]}</p>
          </div>

          <FileDropzone
            accept={operation === 'imagesToPdf' ? 'image/*' : 'application/pdf'}
            multiple={operation === 'merge' || operation === 'imagesToPdf'}
            maxFiles={20}
            showCamera={operation === 'imagesToPdf'}
            onFiles={(picked) => {
              reset()
              setResult(null)
              if (operation === 'imagesToPdf') {
                setImageFiles(picked)
              } else {
                setPdfFiles(operation === 'merge' ? picked : picked.slice(0, 1))
              }
            }}
          />
          <p className="text-xs text-muted-foreground">{t('pdf.workspace.uploadHint')}</p>

          {operation === 'merge' ? (
            <SortableFileList
              files={pdfFiles}
              kind="pdf"
              hint={t('pdf.merge.orderHint')}
              onReorder={setPdfFiles}
              onRemove={(index) => {
                setPdfFiles((prev) => prev.filter((_, i) => i !== index))
              }}
            />
          ) : null}

          {operation === 'imagesToPdf' ? (
            <SortableFileList
              files={imageFiles}
              kind="image"
              hint={t('pdf.imagesToPdf.orderHint')}
              onReorder={setImageFiles}
              onRemove={(index) => {
                setImageFiles((prev) => prev.filter((_, i) => i !== index))
              }}
            />
          ) : null}

          {operation === 'split' ? (
            <div className="space-y-2">
              <Label htmlFor="ranges">{t('pdf.split.rangesLabel')}</Label>
              <Input
                id="ranges"
                value={ranges}
                placeholder={t('pdf.split.rangesPlaceholder')}
                onChange={(e) => setRanges(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('pdf.split.rangesHint')}</p>
            </div>
          ) : null}

          {operation === 'compress' ? (
            <div className="space-y-2">
              <Label htmlFor="targetKb">{t('pdf.compress.targetSizeLabel')}</Label>
              <Input
                id="targetKb"
                type="number"
                min={1}
                value={targetKbInput}
                placeholder={t('pdf.compress.targetSizePlaceholder')}
                onChange={(e) => setTargetKbInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('pdf.compress.targetSizeHint')}</p>
            </div>
          ) : null}

          {operation === 'imagesToPdf' ? (
            <div className="space-y-2">
              <Label htmlFor="dpi">DPI（72-600）</Label>
              <Input
                id="dpi"
                type="number"
                min={72}
                max={600}
                value={dpiInput}
                onChange={(e) => setDpiInput(e.target.value)}
              />
            </div>
          ) : null}

          {operation === 'pages' ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pageOperation">{t('pdf.pages.operationLabel')}</Label>
                <select
                  id="pageOperation"
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={pagesOperation}
                  onChange={(e) => {
                    setPagesOperation(e.target.value as PageOperation)
                    setResult(null)
                  }}
                >
                  <option value="extract">{t('pdf.pages.extract')}</option>
                  <option value="delete">{t('pdf.pages.delete')}</option>
                  <option value="rotate">{t('pdf.pages.rotate')}</option>
                  <option value="reorder">{t('pdf.pages.reorder')}</option>
                </select>
              </div>

              {pagesOperation === 'reorder' ? (
                <div className="space-y-2">
                  <Label htmlFor="orderInput">{t('pdf.pages.newOrderLabel')}</Label>
                  <Input
                    id="orderInput"
                    placeholder={t('pdf.pages.newOrderPlaceholder')}
                    value={orderInput}
                    onChange={(e) => setOrderInput(e.target.value)}
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="pagesInput">
                    {t('pdf.pages.pagesLabel')}
                    {pagesOperation === 'rotate' ? t('pdf.pages.pagesLabelAllSuffix') : ''}
                  </Label>
                  <Input
                    id="pagesInput"
                    placeholder={pagesOperation === 'rotate' ? t('pdf.pages.pagesPlaceholderAll') : t('pdf.pages.pagesPlaceholder')}
                    value={pagesInput}
                    onChange={(e) => setPagesInput(e.target.value)}
                  />
                </div>
              )}

              {pagesOperation === 'rotate' ? (
                <div className="space-y-2">
                  <Label htmlFor="rotation">{t('pdf.pages.rotationLabel')}</Label>
                  <Input
                    id="rotation"
                    type="number"
                    step={90}
                    value={rotationInput}
                    onChange={(e) => setRotationInput(e.target.value)}
                  />
                </div>
              ) : null}

              {singlePdfFile ? (
                <PdfPageWorkspace
                  file={singlePdfFile}
                  mode={pagesOperation === 'reorder' ? 'reorder' : 'select'}
                  pageOperation={pagesOperation}
                  selectedPages={visualSelectedPages}
                  reorderPages={visualOrderPages}
                  onSelectedPagesChange={(pages) => {
                    setPagesInput(formatPageList(pages))
                  }}
                  onReorderPagesChange={(pages) => {
                    setOrderInput(formatPageList(pages))
                  }}
                  onQuickApplyPage={handleQuickApplyPage}
                  onQuickApplySelectedPages={handleQuickApplySelectedPages}
                  quickApplyPending={pending}
                />
              ) : null}

              {pageInputError ? <p className="text-sm text-destructive">{pageInputError}</p> : null}
            </div>
          ) : null}
        </div>
      </ToolPageShell>
    </>
  )
}
