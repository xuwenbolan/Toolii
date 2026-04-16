import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'

import { PreviewToolbar } from './PreviewToolbar'

const DOCX_CLASS = 'docx'

type Props = {
  file: File | null
}

export function DocxPreviewPanel({ file }: Props) {
  const { t } = useTranslation('tools')
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(100)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)

  useEffect(() => {
    if (!file || !containerRef.current) return

    let cancelled = false
    const container = containerRef.current
    container.innerHTML = ''
    setLoading(true)
    setError(null)
    setCurrentPage(1)
    setTotalPages(0)
    setZoom(100)

    async function render() {
      try {
        const arrayBuffer = await file!.arrayBuffer()
        if (cancelled) return

        const { renderAsync } = await import('docx-preview')
        if (cancelled) return

        await renderAsync(arrayBuffer, container, undefined, {
          className: DOCX_CLASS,
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          ignoreLastRenderedPageBreak: true,
          experimental: false,
          trimXmlDeclaration: true,
          useBase64URL: true,
        })

        if (!cancelled) {
          const sections = container.querySelectorAll(`section.${DOCX_CLASS}`)
          setTotalPages(sections.length)
          if (sections.length > 0) setCurrentPage(1)
        }
      } catch {
        if (!cancelled) {
          setError(t('docx.workspace.previewFailed'))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    render()
    return () => { cancelled = true }
  }, [file, t])

  // Track current page via scroll position
  const handleScroll = useCallback(() => {
    if (!scrollRef.current || !containerRef.current || totalPages === 0) return
    const scrollContainer = scrollRef.current
    const sections = containerRef.current.querySelectorAll(`section.${DOCX_CLASS}`)
    if (sections.length === 0) return

    const scrollTop = scrollContainer.scrollTop
    const containerRect = scrollContainer.getBoundingClientRect()
    const viewTarget = scrollTop + containerRect.height / 3

    let page = 1
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i] as HTMLElement
      if (section.offsetTop <= viewTarget) {
        page = i + 1
      }
    }
    setCurrentPage(page)
  }, [totalPages])

  if (!file) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        {t('docx.workspace.dropTitle')}
      </div>
    )
  }

  return (
    <div className="relative flex-1 flex flex-col overflow-hidden docx-preview-container">
      {/* Loading overlay with page skeleton */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/70 backdrop-blur-[2px] z-10" role="status" aria-live="polite">
          <div className="docx-loading-skeleton w-[min(90%,480px)] rounded bg-card shadow-md border border-border/50 overflow-hidden">
            {/* Simulated page content skeleton */}
            <div className="p-8 space-y-4">
              <div className="h-5 w-3/5 rounded bg-muted animate-pulse" />
              <div className="space-y-2 pt-2">
                <div className="h-3 w-full rounded bg-muted/60 animate-pulse" />
                <div className="h-3 w-[92%] rounded bg-muted/60 animate-pulse" />
                <div className="h-3 w-[85%] rounded bg-muted/60 animate-pulse" />
                <div className="h-3 w-[70%] rounded bg-muted/60 animate-pulse" />
              </div>
              <div className="space-y-2 pt-2">
                <div className="h-4 w-2/5 rounded bg-muted animate-pulse" />
                <div className="h-3 w-full rounded bg-muted/60 animate-pulse" />
                <div className="h-3 w-[88%] rounded bg-muted/60 animate-pulse" />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground text-sm mt-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('docx.workspace.analyzing')}
          </div>
        </div>
      )}

      {error ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-8">
          {error}
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="flex-1 overflow-auto docx-scroll-area"
          onScroll={handleScroll}
        >
          <div
            ref={containerRef}
            className="docx-zoom-container"
            style={{
              transform: zoom !== 100 ? `scale(${zoom / 100})` : undefined,
              transformOrigin: 'top center',
              width: zoom !== 100 ? `${10000 / zoom}%` : undefined,
            }}
          />
        </div>
      )}

      {/* Floating toolbar at bottom of canvas */}
      {!error && (
        <PreviewToolbar
          zoom={zoom}
          onZoomChange={setZoom}
          currentPage={currentPage}
          totalPages={totalPages}
        />
      )}
    </div>
  )
}
