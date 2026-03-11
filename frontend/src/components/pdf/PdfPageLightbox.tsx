import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

import type { PageEntry } from '@/hooks/usePdfWorkspace'

type Props = {
  open: boolean
  files: File[]
  pages: PageEntry[]
  initialIndex: number
  onClose: () => void
}

export function PdfPageLightbox({ open, files, pages, initialIndex, onClose }: Props) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [rendering, setRendering] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pdfCacheRef = useRef<Map<number, unknown>>(new Map())
  const touchRef = useRef<{ x: number; y: number } | null>(null)

  // Sync index when lightbox opens
  useEffect(() => {
    if (open) setCurrentIndex(initialIndex)
  }, [open, initialIndex])

  // Clear PDF cache when lightbox closes
  useEffect(() => {
    if (!open) pdfCacheRef.current.clear()
  }, [open])

  const page = pages[currentIndex]
  const hasPrev = currentIndex > 0
  const hasNext = currentIndex < pages.length - 1

  const goPrev = useCallback(() => setCurrentIndex((i) => Math.max(0, i - 1)), [])
  const goNext = useCallback(
    () => setCurrentIndex((i) => Math.min(pages.length - 1, i + 1)),
    [pages.length],
  )

  // Render high-res PDF page
  useEffect(() => {
    if (!open || !page) return
    let cancelled = false

    const render = async () => {
      setRendering(true)
      try {
        const [pdfjsLib, workerModule] = await Promise.all([
          import('pdfjs-dist'),
          import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
        ])
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default

        const file = files[page.sourceFileIndex]
        if (!file || cancelled) return

        // Reuse cached PDF document
        let pdf = pdfCacheRef.current.get(page.sourceFileIndex)
        if (!pdf) {
          const data = new Uint8Array(await file.arrayBuffer())
          const task = pdfjsLib.getDocument({ data })
          pdf = await task.promise
          if (cancelled) return
          pdfCacheRef.current.set(page.sourceFileIndex, pdf)
        }

        const typed = pdf as { getPage: (n: number) => Promise<{
          getViewport: (o: { scale: number; rotation?: number }) => { width: number; height: number }
          render: (o: {
            canvas: HTMLCanvasElement
            canvasContext: CanvasRenderingContext2D
            viewport: { width: number; height: number }
          }) => { promise: Promise<void> }
        }> }

        const pdfPage = await typed.getPage(page.pageNumber)
        if (cancelled) return

        const canvas = canvasRef.current
        if (!canvas) return

        const rotation = ((page.rotation % 360) + 360) % 360
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const maxW = window.innerWidth * 0.92
        const maxH = window.innerHeight * 0.82

        // Use pdfjs rotation so canvas dimensions are correct
        const baseVp = pdfPage.getViewport({ scale: 1, rotation })
        const scale = Math.min(maxW / baseVp.width, maxH / baseVp.height, 3)
        const viewport = pdfPage.getViewport({ scale, rotation })

        canvas.width = Math.ceil(viewport.width * dpr)
        canvas.height = Math.ceil(viewport.height * dpr)
        canvas.style.width = `${Math.ceil(viewport.width)}px`
        canvas.style.height = `${Math.ceil(viewport.height)}px`

        const ctx = canvas.getContext('2d', { alpha: false })
        if (!ctx) return
        // Fill white to prevent black edges from Math.ceil rounding
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

        await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) setRendering(false)
      }
    }

    void render()
    return () => { cancelled = true }
  }, [open, currentIndex, page, files])

  // Keyboard navigation
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose, goPrev, goNext])

  // Lock body scroll
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  if (!open || !page) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        type="button"
        className="absolute right-3 top-3 z-10 rounded-full bg-white/10 p-2 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
        onClick={(e) => { e.stopPropagation(); onClose() }}
      >
        <X className="h-5 w-5" />
      </button>

      {/* Prev button */}
      {hasPrev && (
        <button
          type="button"
          className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white/70 transition-colors hover:bg-white/20 hover:text-white sm:left-4 sm:p-3"
          onClick={(e) => { e.stopPropagation(); goPrev() }}
        >
          <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>
      )}

      {/* Canvas */}
      <div
        className="relative flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => {
          if (e.touches.length === 1) {
            touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
          }
        }}
        onTouchEnd={(e) => {
          if (!touchRef.current) return
          const dx = e.changedTouches[0].clientX - touchRef.current.x
          const dy = e.changedTouches[0].clientY - touchRef.current.y
          touchRef.current = null
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            if (dx < 0) goNext()
            else goPrev()
          }
        }}
      >
        <canvas
          ref={canvasRef}
          className="max-h-[85vh] max-w-[92vw] rounded-sm shadow-2xl"
        />
        {rendering && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-white/20 border-t-white" />
          </div>
        )}
      </div>

      {/* Next button */}
      {hasNext && (
        <button
          type="button"
          className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white/70 transition-colors hover:bg-white/20 hover:text-white sm:right-4 sm:p-3"
          onClick={(e) => { e.stopPropagation(); goNext() }}
        >
          <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>
      )}

      {/* Page indicator */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium tabular-nums text-white/80">
        {currentIndex + 1} / {pages.length}
      </div>
    </div>,
    document.body,
  )
}
