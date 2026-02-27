import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PdfPageList } from '@/components/pdf/PdfPageList'
import { ArtifactPreviewCard } from '@/components/tools/ArtifactPreviewCard'
import { DownloadButton } from '@/components/tools/DownloadButton'
import { ProcessingStatus } from '@/components/tools/ProcessingStatus'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { UploadProgress } from '@/components/upload/UploadProgress'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useFileUpload } from '@/hooks/useFileUpload'
import { formatBytes } from '@/lib/fileValidation'
import { isIntInRange, parseFiniteNumber } from '@/lib/numberInput'
import { editPdfPages, type FileResult } from '@/services/pdfApi'
import { SEOHead } from '@/components/common/SEOHead'

type Operation = 'rotate' | 'delete' | 'extract' | 'reorder'

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

export function PdfPageToolsPage() {
  const { t } = useTranslation('tools')
  const [file, setFile] = useState<File | null>(null)
  const [operation, setOperation] = useState<Operation>('extract')
  const [pagesInput, setPagesInput] = useState('')
  const [orderInput, setOrderInput] = useState('')
  const [rotationInput, setRotationInput] = useState('90')
  const [result, setResult] = useState<FileResult | null>(null)
  const { pending, progress, error, reset, run } = useFileUpload()

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

  const inputError =
    operation === 'reorder' ? parsedOrderPreview.error : parsedPagesPreview.error
  const rotation = parseFiniteNumber(rotationInput)
  const rotationValid =
    operation !== 'rotate' ||
    (rotation != null && isIntInRange(rotation, -3600, 3600) && rotation % 90 === 0)
  const requiredInputMissing =
    operation === 'reorder'
      ? parsedOrderPreview.pages.length === 0
      : (operation === 'extract' || operation === 'delete') && parsedPagesPreview.pages.length === 0

  return (
    <>
      <SEOHead title={t('pdf.pages.seoTitle')} description={t('pdf.pages.seoDescription')} keywords={t('pdf.pages.seoKeywords')} canonicalPath="/pdf-tools/pages" />
      <ToolPageShell title={t('pdf.pages.title')} description={t('pdf.pages.description')} backTo="/pdf-tools">
        <div className="space-y-5">
          <FileDropzone
          accept="application/pdf"
          showCamera={false}
          onFiles={(files) => {
            reset()
            setResult(null)
            setFile(files[0])
          }}
        />

        {file ? (
          <ArtifactPreviewCard
            label={t('common:preview.input')}
            filename={file.name}
            sizeText={formatBytes(file.size)}
            mediaKind="pdf"
          />
        ) : null}

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="operation">{t('pdf.pages.operationLabel')}</Label>
            <select
              id="operation"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={operation}
              onChange={(e) => {
                setResult(null)
                setOperation(e.target.value as Operation)
              }}
            >
              <option value="extract">{t('pdf.pages.extract')}</option>
              <option value="delete">{t('pdf.pages.delete')}</option>
              <option value="rotate">{t('pdf.pages.rotate')}</option>
              <option value="reorder">{t('pdf.pages.reorder')}</option>
            </select>
          </div>

          {operation === 'reorder' ? (
            <div className="space-y-2">
              <Label htmlFor="orderInput">{t('pdf.pages.newOrderLabel')}</Label>
              <Input
                id="orderInput"
                placeholder={t('pdf.pages.newOrderPlaceholder')}
                value={orderInput}
                onChange={(e) => setOrderInput(e.target.value)}
              />
            </div>
          ) : null}

          {operation !== 'reorder' ? (
            <div className="space-y-2">
              <Label htmlFor="pagesInput">
                {t('pdf.pages.pagesLabel')}
                {operation === 'rotate' ? t('pdf.pages.pagesLabelAllSuffix') : ''}
              </Label>
              <Input
                id="pagesInput"
                placeholder={operation === 'rotate' ? t('pdf.pages.pagesPlaceholderAll') : t('pdf.pages.pagesPlaceholder')}
                value={pagesInput}
                onChange={(e) => setPagesInput(e.target.value)}
              />
            </div>
          ) : null}

          {operation === 'rotate' ? (
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
        </div>

        {operation !== 'reorder' ? (
          <PdfPageList pages={parsedPagesPreview.pages} />
        ) : (
          <PdfPageList pages={parsedOrderPreview.pages} />
        )}
        {inputError ? <p className="text-sm text-destructive">{inputError}</p> : null}

        <ProcessingStatus pending={pending} error={error} />
        <UploadProgress value={pending ? progress : null} />

        <div className="space-y-4">
          <Button
            type="button"
            className="w-full"
            disabled={!file || pending || !!inputError || requiredInputMissing || !rotationValid}
            onClick={async () => {
              if (!file || requiredInputMissing || !rotationValid) return
              setResult(null)
              try {
                const pagesList = operation === 'reorder' ? null : parsePageSpec(pagesInput, t)
                const orderList = operation === 'reorder' ? parsePageSpec(orderInput, t) : null
                const pagesPayload =
                  operation === 'rotate'
                    ? pagesList && pagesList.length > 0
                      ? pagesList
                      : undefined
                    : pagesList ?? undefined
                const res = await run((onProgress) =>
                  editPdfPages(
                    file,
                    {
                      operation,
                      pages: pagesPayload,
                      order: orderList && orderList.length > 0 ? orderList : undefined,
                      rotation: rotation ?? 90,
                    },
                    onProgress,
                  ),
                )
                setResult(res)
              } catch {
                // Error message is handled by useFileUpload.
              }
            }}
          >
            {pending ? t('pdf.pages.processing') : t('pdf.pages.startProcess')}
          </Button>

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
      </div>
    </ToolPageShell>
    </>
  )
}
