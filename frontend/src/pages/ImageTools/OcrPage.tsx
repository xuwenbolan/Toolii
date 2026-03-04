import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronLeft, ChevronRight, ClipboardCopy, FileText } from 'lucide-react'

import { SEOHead } from '@/components/common/SEOHead'
import { buildBreadcrumbJsonLd, buildToolJsonLd } from '@/lib/jsonLd'
import { ToolActionBar } from '@/components/tools/ToolActionBar'
import { ToolErrorBanner } from '@/components/tools/ToolErrorBanner'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { ToolWorkspaceDropzone } from '@/components/tools/ToolWorkspaceDropzone'
import { Button } from '@/components/ui/button'
import { useObjectUrl } from '@/hooks/useObjectUrl'
import { useToolRunState } from '@/hooks/useToolRunState'
import { formatBytes } from '@/lib/fileValidation'
import { pdfToImages, type PdfPageImage } from '@/lib/pdfToImages'
import { cn } from '@/lib/utils'
import { ocrImage, type OcrLang, type OcrResult } from '@/services/imageApi'

const LANG_OPTIONS: { value: OcrLang; labelKey: string }[] = [
  { value: 'ch_en', labelKey: 'ocr.langChEn' },
  { value: 'ch', labelKey: 'ocr.langCh' },
  { value: 'en', labelKey: 'ocr.langEn' },
]

type PageResult = {
  pageNumber: number
  imageFile: File
  result: OcrResult | null
  error: string | null
}

function isPdf(file: File) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

export function OcrPage() {
  const { t } = useTranslation(['tools', 'common'])
  const [file, setFile] = useState<File | null>(null)
  const [lang, setLang] = useState<OcrLang>('ch_en')

  // Single-image mode
  const [singleResult, setSingleResult] = useState<OcrResult | null>(null)

  // PDF multi-page mode
  const [pdfMode, setPdfMode] = useState(false)
  const [pageResults, setPageResults] = useState<PageResult[]>([])
  const [activePage, setActivePage] = useState(0) // 0-indexed into pageResults
  const [pdfConvertProgress, setPdfConvertProgress] = useState<string | null>(null)

  const [pending, setPending] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Preview URL for single-image mode
  const singlePreviewUrl = useObjectUrl(pdfMode ? null : file)
  // Preview URL for current PDF page image
  const activePageFile = pdfMode ? pageResults[activePage]?.imageFile ?? null : null
  const pagePreviewUrl = useObjectUrl(activePageFile)

  const inputPreviewUrl = pdfMode ? pagePreviewUrl : singlePreviewUrl
  const currentResult = pdfMode ? pageResults[activePage]?.result ?? null : singleResult

  const fileInfo = useMemo(() => {
    if (!file) return null
    return `${file.name} · ${formatBytes(file.size)}`
  }, [file])

  const totalLines = useMemo(() => {
    if (!pdfMode) return currentResult?.lines.length ?? 0
    return pageResults.reduce((sum, pr) => sum + (pr.result?.lines.length ?? 0), 0)
  }, [pdfMode, pageResults, currentResult])

  const combinedFullText = useMemo(() => {
    if (!pdfMode) return currentResult?.full_text ?? ''
    return pageResults
      .filter((pr) => pr.result?.full_text)
      .map((pr) => pr.result!.full_text)
      .join('\n\n')
  }, [pdfMode, pageResults, currentResult])

  const hasResult = pdfMode ? pageResults.some((pr) => pr.result) : Boolean(singleResult)

  const runState = useToolRunState({
    mode: 'auto',
    hasInput: Boolean(file),
    hasResult,
    pending,
    error,
    texts: {
      input: fileInfo ?? undefined,
      result: hasResult ? t('ocr.linesCount', { count: totalLines }) : undefined,
    },
  })

  const resetAll = useCallback(() => {
    setSingleResult(null)
    setPdfMode(false)
    setPageResults([])
    setActivePage(0)
    setPdfConvertProgress(null)
    setPending(false)
    setProgress(0)
    setError(null)
    setCopied(false)
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
  }, [])

  // Run OCR on a single image File
  const runSingleOcr = useCallback(
    async (input: File, ocrLang: OcrLang, signal: AbortSignal) => {
      const res = await ocrImage(input, { lang: ocrLang })
      if (signal.aborted) return null
      return res
    },
    [],
  )

  // Main entry: handle file upload
  const handleFile = useCallback(
    async (input: File, ocrLang: OcrLang = lang) => {
      resetAll()
      setFile(input)

      if (abortRef.current) abortRef.current.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setPending(true)
      setError(null)

      try {
        if (isPdf(input)) {
          // PDF mode: convert pages to images, then OCR each
          setPdfMode(true)
          setPdfConvertProgress(t('ocr.pdfConverting'))

          let pages: PdfPageImage[]
          try {
            pages = await pdfToImages(input, (p) => {
              setPdfConvertProgress(t('ocr.pdfConvertingPage', { current: p.current, total: p.total }))
              setProgress(Math.round((p.current / p.total) * 30)) // 0-30% for conversion
            })
          } catch {
            throw new Error(t('ocr.pdfConvertFailed'))
          }

          if (controller.signal.aborted) return
          if (pages.length === 0) throw new Error(t('ocr.pdfEmpty'))

          setPdfConvertProgress(null)

          // Initialize page results
          const initial: PageResult[] = pages.map((p) => ({
            pageNumber: p.pageNumber,
            imageFile: p.blob,
            result: null,
            error: null,
          }))
          setPageResults(initial)

          // OCR each page sequentially
          for (let i = 0; i < pages.length; i++) {
            if (controller.signal.aborted) return
            setProgress(30 + Math.round(((i + 0.5) / pages.length) * 70))

            try {
              const res = await runSingleOcr(pages[i].blob, ocrLang, controller.signal)
              if (controller.signal.aborted) return
              setPageResults((prev) => {
                const next = [...prev]
                next[i] = { ...next[i], result: res }
                return next
              })
            } catch (err) {
              if (controller.signal.aborted) return
              setPageResults((prev) => {
                const next = [...prev]
                next[i] = { ...next[i], error: err instanceof Error ? err.message : 'OCR failed' }
                return next
              })
            }
          }
        } else {
          // Single image mode
          setPdfMode(false)
          setProgress(50)
          const res = await runSingleOcr(input, ocrLang, controller.signal)
          if (controller.signal.aborted) return
          setSingleResult(res)
        }
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : 'OCR failed')
      } finally {
        if (!controller.signal.aborted) {
          setPending(false)
          setProgress(100)
        }
      }
    },
    [lang, resetAll, runSingleOcr, t],
  )

  const handleCopy = useCallback(() => {
    const text = combinedFullText
    if (!text) return
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
    })
  }, [combinedFullText])

  return (
    <>
      <SEOHead
        title={t('ocr.seoTitle')}
        description={t('ocr.seoDescription')}
        keywords={t('ocr.seoKeywords')}
        canonicalPath="/image-tools/ocr"
        jsonLd={[buildToolJsonLd({ name: t('ocr.seoTitle'), description: t('ocr.seoDescription'), url: '/image-tools/ocr' }), buildBreadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: t('title'), path: '/image-tools' }, { name: t('ocr.title'), path: '/image-tools/ocr' }])]}
      />
      <ToolPageShell title={t('ocr.title')} description={t('ocr.description')} toolName="image/ocr" backTo="/image-tools">
        <div className="space-y-5">
          <ToolWorkspaceDropzone
            accept={{ 'image/*': [], 'application/pdf': ['.pdf'] }}
            multiple={false}
            maxFiles={1}
            onFiles={(files) => {
              const nextFile = files[0]
              if (nextFile) void handleFile(nextFile)
            }}
            title={t('ocr.dropTitle')}
            hint={t('ocr.dropHint')}
          />
          <ToolErrorBanner error={error} onRetry={file ? () => void handleFile(file, lang) : undefined} />

          <div className="space-y-2">
            <label className="text-sm font-medium">{t('ocr.langLabel')}</label>
            <div className="flex flex-wrap gap-2">
              {LANG_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  type="button"
                  size="sm"
                  variant={lang === opt.value ? 'secondary' : 'outline'}
                  disabled={pending}
                  onClick={() => {
                    setLang(opt.value)
                    if (file && lang !== opt.value && !pending) void handleFile(file, opt.value)
                  }}
                >
                  {t(opt.labelKey)}
                </Button>
              ))}
            </div>
          </div>

          {/* PDF conversion progress */}
          {pdfConvertProgress ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-4 w-4 animate-pulse" />
              {pdfConvertProgress}
            </div>
          ) : null}

          {/* PDF page navigator */}
          {pdfMode && pageResults.length > 1 ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={activePage === 0}
                onClick={() => setActivePage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium tabular-nums">
                {t('ocr.pageOf', { current: activePage + 1, total: pageResults.length })}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={activePage >= pageResults.length - 1}
                onClick={() => setActivePage((p) => Math.min(pageResults.length - 1, p + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              {pdfMode && totalLines > 0 ? (
                <span className="ml-2 text-xs text-muted-foreground">
                  {t('ocr.totalLines', { count: totalLines })}
                </span>
              ) : null}
            </div>
          ) : null}

          {(file && !pdfConvertProgress) || hasResult ? (
            <div className="grid gap-5 lg:grid-cols-2">
              {/* Left: image preview */}
              {inputPreviewUrl ? (
                <div className="space-y-2 rounded-xl border border-border/70 bg-card/70 p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    {pdfMode
                      ? t('ocr.pagePreview', { page: activePage + 1 })
                      : t('common:preview.input')}
                  </p>
                  <img
                    src={inputPreviewUrl}
                    alt={file?.name}
                    className="max-h-[60vh] w-full rounded-md object-contain"
                  />
                  {fileInfo ? <p className="text-xs text-muted-foreground">{fileInfo}</p> : null}
                </div>
              ) : null}

              {/* Right: recognized text */}
              {currentResult ? (
                <div className="space-y-2 rounded-xl border border-border/70 bg-card/70 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">
                      {t('ocr.recognizedText')} ({currentResult.lines.length} {t('ocr.linesLabel')})
                    </p>
                    <Button type="button" size="sm" variant="outline" onClick={handleCopy}>
                      {copied ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                      {copied ? t('ocr.copied') : (pdfMode ? t('ocr.copyAllPages') : t('ocr.copyAll'))}
                    </Button>
                  </div>
                  <div className="max-h-[60vh] overflow-auto rounded-lg border border-border/50 bg-muted/30 p-3">
                    <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed">{currentResult.full_text}</pre>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('ocr.engine')}: {currentResult.engine} | {currentResult.width}x{currentResult.height}
                  </p>
                </div>
              ) : (
                // Show loading state for active page during processing
                pending && pdfMode && !currentResult ? (
                  <div className={cn(
                    'flex items-center justify-center rounded-xl border border-border/70 bg-card/70 p-8',
                    'animate-pulse',
                  )}>
                    <p className="text-sm text-muted-foreground">{t('ocr.processing')}</p>
                  </div>
                ) : null
              )}
            </div>
          ) : null}
        </div>
      </ToolPageShell>

      <ToolActionBar
        mode="auto"
        status={runState.statusText}
        pending={pending}
        progress={pending ? progress : hasResult ? 100 : 0}
        error={error}
        done={runState.phase === 'done'}
      />
    </>
  )
}
